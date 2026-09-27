import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { catalog } from "../server/catalog.js";
import { validateCardManifest } from "../server/card-manifest.js";

const cards = JSON.parse(
  await readFile(new URL("../content/cards.json", import.meta.url), "utf8"),
);
validateCardManifest(cards, catalog);

function normalizedTitle(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

async function mapLimit(items, concurrency, worker) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const index = next++;
        output[index] = await worker(items[index]);
      }
    }),
  );
  return output;
}

const issues = [];
await mapLimit(cards, 5, async (card) => {
  try {
    const response = await fetch(card.tcgdexApiUrl, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      response.status,
      200,
      `${card.cardId}: TCGdex HTTP ${response.status}`,
    );
    const apiCard = await response.json();
    assert.equal(apiCard.id, card.cardId, `${card.cardId}: TCGdex ID differs`);
    assert.equal(
      apiCard.illustrator,
      card.artist,
      `${card.cardId}: TCGdex illustrator differs from reviewed credit`,
    );
    assert.ok(
      apiCard.dexId?.includes(card.tcgdexDexId),
      `${card.cardId}: TCGdex dex ID differs from manifest`,
    );
    assert.equal(
      apiCard.set?.name,
      card.set,
      `${card.cardId}: TCGdex set differs`,
    );
    assert.equal(
      apiCard.localId,
      card.number.split("/")[0],
      `${card.cardId}: TCGdex collector number differs`,
    );
    assert.equal(
      normalizedTitle(apiCard.name),
      normalizedTitle(card.tcgdexName ?? card.title),
      `${card.cardId}: TCGdex card title differs`,
    );
    assert.ok(
      card.tcgdexImageUrl.startsWith(`${apiCard.image}/`),
      `${card.cardId}: image URL is not this TCGdex card`,
    );

    const imageResponse = await fetch(card.image, {
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(
      imageResponse.status,
      200,
      `${card.cardId}: image HTTP ${imageResponse.status}`,
    );
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.equal(
      imageBytes.toString("hex", 0, 8),
      "89504e470d0a1a0a",
      `${card.cardId}: image is not a PNG`,
    );
    assert.equal(
      createHash("sha256").update(imageBytes).digest("hex"),
      card.imageSha256,
      `${card.cardId}: image SHA-256 changed`,
    );
    assert.deepEqual(
      {
        width: imageBytes.readUInt32BE(16),
        height: imageBytes.readUInt32BE(20),
      },
      card.imageDimensions,
      `${card.cardId}: PNG IHDR dimensions changed`,
    );
  } catch (error) {
    issues.push(`${card.cardId}: ${error.message}`);
  }
});

if (issues.length) {
  console.error("card audit failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  const counts = new Map();
  for (const card of cards)
    counts.set(card.pokemonId, (counts.get(card.pokemonId) ?? 0) + 1);
  const covered = catalog.filter((pokemon) => counts.has(pokemon.id));
  const belowThree = catalog.filter(
    (pokemon) => (counts.get(pokemon.id) ?? 0) < 3,
  );
  console.log(
    `card audit passed: ${cards.length} checked editions / ${covered.length} of ${catalog.length} species covered`,
  );
  console.log(
    `three-edition coverage: ${catalog.length - belowThree.length} species at or above target`,
  );
  for (const pokemon of catalog)
    console.log(
      `${String(counts.get(pokemon.id) ?? 0).padStart(2)}  ${pokemon.name} ${`#${String(pokemon.id).padStart(3, "0")}`}`,
    );
  console.log(
    "publisher or printed-credit observations are recorded in the manifest; blocked pages are not fetched or inferred by this script.",
  );
}
