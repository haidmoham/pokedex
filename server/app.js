import express from "express";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "./catalog.js";
import { validateCardManifest } from "./card-manifest.js";
import cards from "../content/cards.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

validateCardManifest(cards, catalog);

export function createApp({
  dataFile = resolve(root, "data/favorites.json"),
  serveClient = true,
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
    console.error(error);
    response.status(500).json({ error: "server error" });
  });
  return app;
}
