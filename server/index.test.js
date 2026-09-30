import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { catalog } from "./catalog.js";
import { validateCardManifest } from "./card-manifest.js";

const cardManifest = JSON.parse(
  await readFile(new URL("../content/cards.json", import.meta.url), "utf8"),
);

test("catalog search and saved favorites work across requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pokedex-test-"));
  const server = createApp({
    dataFile: join(directory, "favorites.json"),
    serveClient: false,
  }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const search = await fetch(`${base}/api/pokemon?q=char&type=fire`);
    assert.deepEqual(
      (await search.json()).map(({ id }) => id),
      [4, 5, 6, 390, 935],
    );

    const add = await fetch(`${base}/api/favorites/4`, { method: "POST" });
    assert.equal(add.status, 200);
    await fetch(`${base}/api/favorites/4`, { method: "POST" });
    assert.deepEqual(await (await fetch(`${base}/api/favorites`)).json(), [4]);

    const invalid = await fetch(`${base}/api/favorites/9999`, {
      method: "POST",
    });
    assert.equal(invalid.status, 404);
    await fetch(`${base}/api/favorites/4`, { method: "DELETE" });
    assert.deepEqual(await (await fetch(`${base}/api/favorites`)).json(), []);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true });
  }
});

test("checked card editions support the Dragapult and illustrator journeys", async () => {
  const server = createApp({ serveClient: false }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const speciesResponse = await fetch(`${base}/api/pokemon?q=887`);
    const species = await speciesResponse.json();
    assert.deepEqual(
      species.map(({ id, name }) => ({ id, name })),
      [{ id: 887, name: "Dragapult" }],
    );

    const dragapultResponse = await fetch(`${base}/api/cards?pokemonId=887`);
    const dragapultCards = await dragapultResponse.json();
    assert.equal(dragapultCards.length, 4);
    assert.deepEqual(
      dragapultCards.map(({ pokemonId, cardId }) => [pokemonId, cardId]),
      [
        [887, "sv08.5-165"],
        [887, "swsh2-91"],
        [887, "swsh2-93"],
        [887, "me02.5-160"],
      ],
    );
    for (const card of dragapultCards) {
      assert.equal(card.pokemonName, "Dragapult");
      assert.ok(card.artist);
      assert.ok(card.artistEvidenceUrl);
      assert.ok(card.imageSha256);
    }

    const jerkyResponse = await fetch(
      `${base}/api/cards?artist=${encodeURIComponent("Jerky")}`,
    );
    const jerkyCards = await jerkyResponse.json();
    assert.deepEqual(
      jerkyCards.map(({ pokemonId, cardId, artist }) => [
        pokemonId,
        cardId,
        artist,
      ]),
      [
        [887, "sv08.5-165", "Jerky"],
        [16, "sv03-207", "Jerky"],
      ],
    );

    const fivebanResponse = await fetch(
      `${base}/api/cards?artist=${encodeURIComponent("5ban Graphics")}`,
    );
    const fivebanCards = await fivebanResponse.json();
    assert.deepEqual(
      fivebanCards.map(({ pokemonId, cardId, artist }) => [
        pokemonId,
        cardId,
        artist,
      ]),
      [
        [887, "me02.5-160", "5ban Graphics"],
        [94, "xy4-35", "5ban Graphics"],
      ],
    );

    assert.deepEqual(
      await (await fetch(`${base}/api/cards?pokemonId=999`)).json(),
      [],
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("manifest gate rejects mismatched credits, dex IDs, and duplicate cards", () => {
  const printedCard = cardManifest.find((card) => card.cardId === "sv08.5-165");
  const wrongArtist = structuredClone(printedCard);
  wrongArtist.artistObservedText = "Illus. Some Other Name";
  assert.throws(
    () => validateCardManifest([wrongArtist], catalog),
    /printed credit differs/,
  );

  const wrongDex = structuredClone(printedCard);
  wrongDex.tcgdexDexId = 94;
  assert.throws(
    () => validateCardManifest([wrongDex], catalog),
    /recorded TCGdex dex ID differs/,
  );

  const duplicateCard = structuredClone(printedCard);
  assert.throws(
    () => validateCardManifest([printedCard, duplicateCard], catalog),
    /duplicate manifest ID/,
  );
});

test("partially failed discovery pages bypass CDN caching and recover on retry", async () => {
  let attempts = 0;
  const server = createApp({ serveClient:false, stateless:true, discover:async () => {
    attempts++;
    return { cards:[], failed:attempts === 1 ? ['temporary-failure'] : [], scanned:1, total:1, nextOffset:null };
  } }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${base}/api/discovery/887?offset=0`);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await first.json()).failed, ['temporary-failure']);
    const retry = await fetch(`${base}/api/discovery/887?offset=0`);
    assert.match(retry.headers.get('cache-control'), /s-maxage=1800/);
    assert.deepEqual((await retry.json()).failed, []);
    assert.equal(attempts, 2);
  } finally {
    await new Promise(done => server.close(done));
  }
});

test("stateless previews never read or mutate shared server favorites", async () => {
  const server = createApp({ serveClient:false, stateless:true }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, method] of [['/api/favorites','GET'], ['/api/favorites/887','POST'], ['/api/favorites/887','DELETE']]) {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 410);
      assert.match((await response.json()).error, /privately on this device/);
    }
  } finally {
    await new Promise(done => server.close(done));
  }
});
