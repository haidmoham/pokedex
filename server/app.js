import express from "express";
import { discoverCards } from "./discovery.js";
import { discoverArtistCards, isValidArtist, isValidArtistOffset } from "./artist-discovery.js";
import { createTrailDiscovery, validTrailRequest } from './trail.js';
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "./catalog.js";
import { validateCardManifest } from "./card-manifest.js";
import cards from "../content/cards.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

validateCardManifest(cards, catalog);

function artistSourceErrorCode(error) {
  // Classify only known internal failure signals. Never return the upstream
  // message, URL, response body or stack in a public diagnostic.
  if (error?.message === 'source request timed out'
    || ['AbortError', 'TimeoutError'].includes(error?.name)
    || ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(error?.cause?.code)) {
    return 'ARTIST_SOURCE_TIMEOUT';
  }
  if (error?.message === 'invalid source artist index' || error instanceof SyntaxError) {
    return 'ARTIST_SOURCE_INDEX_INVALID';
  }
  const statusCodes = {
    'source returned 404': 'ARTIST_SOURCE_NOT_FOUND',
    'source returned 401': 'ARTIST_SOURCE_UNAUTHORIZED',
    'source returned 403': 'ARTIST_SOURCE_FORBIDDEN',
    'source returned 429': 'ARTIST_SOURCE_RATE_LIMITED',
  };
  return Object.hasOwn(statusCodes, error?.message)
    ? statusCodes[error.message] : 'ARTIST_SOURCE_UNAVAILABLE';
}

export function createApp({
  dataFile = resolve(root, "data/favorites.json"),
  serveClient = true,
  stateless = false,
  discover = discoverCards,
  discoverArtist = discoverArtistCards,
  discoverTrail = createTrailDiscovery({ discoverArtist, discover }),
} = {}) {
  const app = express();
  app.use(express.json());

  async function readFavorites() {
    try {
      const ids = JSON.parse(await readFile(dataFile, "utf8"));
      if (!Array.isArray(ids))
        throw new Error("favorites data must be an array");
      return ids;
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function saveFavorites(ids) {
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, JSON.stringify(ids, null, 2) + "\n");
  }

  app.get("/api/pokemon", (request, response) => {
    const query = String(request.query.q ?? "")
      .trim()
      .toLowerCase();
    const type = String(request.query.type ?? "")
      .trim()
      .toLowerCase();
    response.json(
      catalog.filter(
        (pokemon) =>
          (!query ||
            pokemon.name.toLowerCase().includes(query) ||
            String(pokemon.id) === query) &&
          (!type || pokemon.types.includes(type)),
      ),
    );
  });

  app.get("/api/cards", (request, response) => {
    const pokemonId = request.query.pokemonId;
    const artist = String(request.query.artist ?? "")
      .trim()
      .toLocaleLowerCase();
    const filtered = cards.filter(
      (card) =>
        (!pokemonId || card.pokemonId === Number(pokemonId)) &&
        (!artist || card.artist.toLocaleLowerCase() === artist),
    );
    response.json(filtered);
  });

  app.get('/api/discovery/:id', async (request, response) => {
    const pokemon = catalog.find(p => p.id === Number(request.params.id));
    const offset = Number(request.query.offset ?? 0);
    if (!pokemon || !Number.isInteger(offset) || offset < 0 || offset > 5000) return response.status(400).json({error:'invalid species or page'});
    try {
      const data = await discover(pokemon,offset);
      // A transiently failed page must be retried upstream, not frozen by CDN caching.
      response.set('Cache-Control',data.failed.length ? 'no-store' : 'public, s-maxage=1800, stale-while-revalidate=3600').json(data);
    } catch { response.status(502).json({error:'card source unavailable; saved cards and official artwork remain available'}); }
  });
  app.get('/api/artists/:artist', async (request, response) => {
    const artist = request.params.artist;
    const rawOffset = request.query.offset ?? '0';
    const offset = typeof rawOffset === 'string' && /^(0|[1-9]\d*)$/.test(rawOffset) ? Number(rawOffset) : NaN;
    // Vercel forwards the named /api/:path* rewrite capture as query metadata.
    // Ignore that routing key; it must not influence artist identity or paging.
    const unexpectedKeys = Object.keys(request.query).filter(key => key !== 'offset' && key !== 'path').sort();
    const reason = !isValidArtist(artist) ? 'artist'
      : !isValidArtistOffset(offset) ? 'offset'
      : unexpectedKeys.length ? 'unexpected_query' : null;
    if (reason) {
      return response.status(400).set('Cache-Control', 'no-store').json({
        error: 'invalid artist or page', code: 'ARTIST_REQUEST_INVALID', reason, unexpectedKeys,
      });
    }
    try {
      const data = await discoverArtist(artist, offset);
      return response.set('Cache-Control', data.failed.length ? 'no-store' : 'public, s-maxage=1800, stale-while-revalidate=3600').json(data);
    } catch (error) {
      return response.status(502).set('Cache-Control', 'no-store').json({
        error: 'artist card source unavailable; loaded artwork remains available', code: artistSourceErrorCode(error),
      });
    }
  });
  app.post('/api/trail', async (request, response) => {
    // Vercel appends its rewrite capture as query metadata; it is not part of
    // the user's deterministic cursor.
    if (Object.keys(request.query).some(key => key !== 'path') || !validTrailRequest(request.body)) {
      return response.status(400).set('Cache-Control', 'no-store').json({ error: 'invalid discovery trail request' });
    }
    try {
      return response.set('Cache-Control', 'no-store').json(await discoverTrail(request.body));
    } catch {
      return response.status(502).set('Cache-Control', 'no-store').json({ error: 'related artwork source unavailable; current trail remains available' });
    }
  });
  app.use('/api/favorites', (request, response, next) => {
    if (stateless) return response.status(410).json({error:'favorites are saved privately on this device'});
    next();
  });

  app.get("/api/favorites", async (_request, response, next) => {
    try {
      response.json(await readFavorites());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/favorites/:id", async (request, response, next) => {
    try {
      const id = Number(request.params.id);
      if (
        !Number.isInteger(id) ||
        !catalog.some((pokemon) => pokemon.id === id)
      ) {
        return response.status(404).json({ error: "pokémon not found" });
      }
      const ids = await readFavorites();
      if (!ids.includes(id)) await saveFavorites([...ids, id]);
      return response.json({ id, favorite: true });
    } catch (error) {
      return next(error);
    }
  });

  app.delete("/api/favorites/:id", async (request, response, next) => {
    try {
      const id = Number(request.params.id);
      if (
        !Number.isInteger(id) ||
        !catalog.some((pokemon) => pokemon.id === id)
      ) {
        return response.status(404).json({ error: "pokémon not found" });
      }
      const ids = await readFavorites();
      await saveFavorites(ids.filter((favoriteId) => favoriteId !== id));
      return response.json({ id, favorite: false });
    } catch (error) {
      return next(error);
    }
  });

  if (serveClient) {
    app.use(express.static(resolve(root, "dist")));
    app.get(/.*/, (_request, response) =>
      response.sendFile(resolve(root, "dist/index.html")),
    );
  }

  app.use((error, _request, response, _next) => {
    if (error instanceof URIError) {
      return response.status(400).set('Cache-Control', 'no-store').json({ error: 'invalid request encoding', code: 'REQUEST_ENCODING_INVALID' });
    }
    console.error(error);
    response.status(500).json({ error: "server error" });
  });
  return app;
}
