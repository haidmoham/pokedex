export type Pokemon = { id: number; name: string; types: string[]; height: number; weight: number };
export type Price = { amount: number; currency: string; variant: string; updatedAt: string; provider: string; metric: string; url: string };
export type CardEdition = {
  prices?: Price[]; sourceType?: string; pokemonId: number; pokemonIds?: number[];
  pokemonName: string; cardId: string; title: string; set: string; number: string;
  language: string; rarity: string; artist: string; image: string; imageProvider: string;
  imageSha256: string; imageDimensions?: { width: number; height: number };
  tcgdexUrl: string; publisherUrl?: string; publisherCheck: string;
  artistEvidenceMethod: string; artistEvidenceUrl: string; artistObservedText: string;
};

export const artwork = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
export const dexNumber = (id: number) => String(id).padStart(3, '0');
export function nationalDex<T extends { id: number }>(species: T[]): T[] {
  return [...species].sort((a, b) => a.id - b.id);
}
// Species have real endpoints; moving above #1 must never jump to #1025.
export function adjacentIndex(index: number, direction: number, length: number) {
  return Math.max(0, Math.min(Math.max(0, length - 1), index + direction));
}
export function recentPrice(card: Pick<CardEdition, 'prices'>, currency: string, now = Date.now()) {
  return card.prices?.filter(price => {
    const updated = Date.parse(price.updatedAt);
    return price.currency === currency && Number.isFinite(price.amount) && price.amount > 0 &&
      Number.isFinite(updated) && updated <= now + 86400000 && now - updated <= 7 * 86400000;
  }).sort((a, b) => b.amount - a.amount)[0];
}
export function rankedCards<T extends Pick<CardEdition, 'prices' | 'cardId'>>(cards: T[], currency: string, now = Date.now()): T[] {
  return [...cards].sort((a, b) => (recentPrice(b, currency, now)?.amount ?? -1) - (recentPrice(a, currency, now)?.amount ?? -1) || a.cardId.localeCompare(b.cardId));
}
// Only an explicit selection pins identity. New discoveries may improve the lead
// until the viewer swipes, selects, or opens details for a particular edition.
export function selectedCard<T extends { cardId: string }>(cards: T[], selectedId?: string): T | undefined {
  return cards.find(card => card.cardId === selectedId) ?? cards[0];
}
export function officialEdition(pokemon: Pokemon): CardEdition {
  return {
    pokemonId: pokemon.id, pokemonName: pokemon.name, cardId: `official-${pokemon.id}`,
    title: pokemon.name, set: 'Official species artwork', number: `#${dexNumber(pokemon.id)}`,
    language: '', rarity: '', artist: 'Individual artist not specified', image: artwork(pokemon.id),
    imageProvider: 'PokéAPI sprites', imageSha256: '', imageDimensions: { width: 475, height: 475 },
    tcgdexUrl: 'https://github.com/PokeAPI/sprites', publisherCheck: '',
    artistEvidenceMethod: 'Official species artwork; individual artist not specified',
    artistEvidenceUrl: 'https://github.com/PokeAPI/sprites', artistObservedText: '', sourceType: 'official',
  };
}
