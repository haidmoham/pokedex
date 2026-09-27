import assert from "node:assert/strict";

export function validateCardManifest(cards, catalog) {
  const pokemonById = new Map(catalog.map((pokemon) => [pokemon.id, pokemon]));
  const cardIds = new Set();

  for (const card of cards) {
    assert.ok(
      !cardIds.has(card.cardId),
      `${card.cardId}: duplicate manifest ID`,
    );
    cardIds.add(card.cardId);

    const pokemon = pokemonById.get(card.pokemonId);
    assert.ok(pokemon, `${card.cardId}: Pokémon ID is outside the catalog`);
    assert.equal(
      card.pokemonName,
      pokemon.name,
      `${card.cardId}: Pokémon name and ID differ`,
    );
    assert.equal(
      card.tcgdexDexId,
      card.pokemonId,
      `${card.cardId}: recorded TCGdex dex ID differs`,
    );
    assert.equal(
      card.language,
      "en",
      `${card.cardId}: unexpected card language`,
    );
    assert.ok(
      card.title && card.set && card.number && card.artist,
      `${card.cardId}: required edition metadata is missing`,
    );
    assert.match(
      card.number,
      /^\d+\/\d+$/,
      `${card.cardId}: malformed collector number`,
    );
    assert.ok(
      card.tcgdexApiUrl?.endsWith(`/cards/${card.cardId}`),
      `${card.cardId}: exact TCGdex API URL is missing`,
    );
    assert.ok(
      card.artistEvidenceUrl && card.artistEvidenceMethod && card.checkedAt,
      `${card.cardId}: evidence record is incomplete`,
    );
    assert.match(
      card.imageSha256 ?? "",
      /^[a-f0-9]{64}$/,
      `${card.cardId}: image hash is invalid`,
    );
    assert.ok(
      card.imageDimensions?.width > 0 && card.imageDimensions?.height > 0,
      `${card.cardId}: image dimensions are missing`,
    );
    assert.match(
      card.image ?? "",
      /^https:\/\/(assets\.tcgdex\.net|assets\.pokemon\.com)\//,
      `${card.cardId}: image host is not recognized`,
    );
    assert.match(
      card.tcgdexImageUrl ?? "",
      /^https:\/\/assets\.tcgdex\.net\//,
      `${card.cardId}: TCGdex card image URL is missing`,
    );

    if (card.publisherUrl) {
      assert.ok(
        card.publisherUrl.startsWith("https://www.pokemon.com/"),
        `${card.cardId}: publisher page is not on pokemon.com`,
      );
    }

    if (/publisher exact-card page reviewed/i.test(card.artistEvidenceMethod)) {
      assert.ok(
        card.publisherUrl,
        `${card.cardId}: publisher evidence URL is missing`,
      );
      assert.equal(
        card.publisherObservedArtist,
        card.artist,
        `${card.cardId}: publisher artist differs`,
      );
      assert.equal(
        card.artistObservedText,
        card.artist,
        `${card.cardId}: publisher text differs`,
      );
    } else {
      assert.match(
        card.artistEvidenceMethod,
        /printed-card scan .*inspected/i,
        `${card.cardId}: no accepted artist proof`,
      );
      assert.equal(
        card.artistObservedText,
        `Illus. ${card.artist}`,
        `${card.cardId}: printed credit differs`,
      );
      assert.equal(
        card.artistEvidenceUrl,
        card.tcgdexImageUrl,
        `${card.cardId}: scan URL is not the checked card image`,
      );
    }
  }

  return {
    cardCount: cards.length,
    coveredPokemonCount: new Set(cards.map((card) => card.pokemonId)).size,
  };
}
