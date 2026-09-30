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

type FeedViewport = Pick<HTMLElement, 'clientHeight' | 'scrollTop' | 'scrollTo'> & { style: { overflowY: string } };

// Native swipes update position; explicit navigation is immediate and modal
// inspection freezes one position until the drawer is dismissed.
export class FeedPosition {
  index = 0;
  locked = false;
  private overflowY = '';

  sync(viewport: FeedViewport, length: number) {
    if (!this.locked && viewport.clientHeight > 0) this.index = adjacentIndex(Math.round(viewport.scrollTop / viewport.clientHeight), 0, length);
    return this.index;
  }

  settle(viewport: FeedViewport) {
    viewport.scrollTo({ top: this.index * viewport.clientHeight, behavior: 'instant' });
  }

  jump(viewport: FeedViewport, index: number, length: number) {
    if (!this.locked) {
      this.index = adjacentIndex(index, 0, length);
      this.settle(viewport);
    }
    return this.index;
  }

  lock(viewport: FeedViewport, index: number) {
    if (this.locked) return;
    this.index = index;
    this.overflowY = viewport.style.overflowY;
    this.locked = true;
    viewport.style.overflowY = 'hidden';
    this.settle(viewport);
  }

  unlock(viewport: FeedViewport): number | null {
    if (!this.locked) return null;
    viewport.style.overflowY = this.overflowY;
    this.settle(viewport);
    this.locked = false;
    return this.index;
  }
}

export function rememberFailedImage(images: string[], image: string) {
  return images.includes(image) ? images : [...images, image];
}

// Only a deliberate retry or a new online event clears a failed URL. Repeated
// image errors cannot start a render/request loop.
export function retryFailedImages(images: string[], image?: string) {
  return image === undefined ? [] : images.filter(failed => failed !== image);
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
