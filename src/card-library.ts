type LibraryCard = {
  cardId: string;
  pokemonId: number;
  pokemonIds?: number[];
  prices?: unknown[];
};

export function cardSpeciesIds(card: LibraryCard): number[] {
  return [...new Set([card.pokemonId, ...(card.pokemonIds ?? [])])];
}

export function belongsToSpecies(card: LibraryCard, pokemonId: number): boolean {
  return cardSpeciesIds(card).includes(pokemonId);
}

// One card identity can belong to several species. Keep one artist-gallery
// entry and preserve its recorded provenance while refreshing prices.
export function mergeCardLibrary<T extends LibraryCard>(previous: T[], incoming: T[]): T[] {
  const byId = new Map(previous.map(card => [card.cardId, card]));
  for (const card of incoming) {
    const checked = byId.get(card.cardId);
    byId.set(card.cardId, checked ? {
      ...checked,
      prices: card.prices,
      pokemonIds: [...new Set([...cardSpeciesIds(checked), ...cardSpeciesIds(card)])],
    } : card);
  }
  return [...byId.values()];
}
