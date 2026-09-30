import { catalog } from './catalog.js';
import { extractPrices } from './discovery.js';
import { createConcurrencyLimit, createSourceCache } from './source-cache.js';

const ROOT = 'https://api.tcgdex.net/v2/en';
const PAGE_SIZE = 12;
const speciesById = new Map(catalog.map(pokemon => [pokemon.id, pokemon]));
const compareIds = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function isValidArtist(artist) {
  return typeof artist === 'string' && artist.length > 0 && artist.length <= 120
    && artist === artist.trim() && artist !== '.' && artist !== '..'
    && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(artist);
}

export function isValidArtistOffset(offset) {
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 100000;
}

function isSafeCardId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
}

function artworkUrl(image) {
  if (typeof image !== 'string') return null;
  // TCGdex publishes a base asset path, not an arbitrary remote image URL.
  // Reject credentials, ports, queries, encoded path tricks and dot segments.
  if (!/^https:\/\/assets\.tcgdex\.net\/[A-Za-z0-9_/-][A-Za-z0-9._/-]*$/.test(image)) return null;
  const path = image.slice('https://assets.tcgdex.net/'.length);
  if (path.split('/').some(part => part === '.' || part === '..' || part === '')) return null;
  return `${image}/high.webp`;
}

export function normalizeArtistCard(card, artist, cardId, now = Date.now()) {
  if (!isSafeCardId(cardId) || !card || card.id !== cardId) return { reason: 'invalid_card_id' };
  if (typeof card.illustrator !== 'string' || !isValidArtist(card.illustrator)) return { reason: 'missing_artist_credit' };
  if (card.illustrator !== artist) return { reason: 'artist_credit_mismatch' };
  if (card.category && !['Pokemon', 'Pokémon'].includes(card.category)) return { reason: 'not_pokemon' };
  const pokemonIds = [...new Set(Array.isArray(card.dexId) ? card.dexId.filter(id =>
    Number.isInteger(id) && id >= 1 && id <= 1025 && speciesById.has(id)) : [])].sort((a, b) => a - b);
  if (!pokemonIds.length) return { reason: 'no_valid_species' };
  const image = artworkUrl(card.image);
  if (!image) return { reason: 'invalid_artwork' };
  if (typeof card.name !== 'string' || !card.name.trim()) return { reason: 'missing_card_title' };
  const pokemon = speciesById.get(pokemonIds[0]);
  const sourceUrl = `${ROOT}/cards/${encodeURIComponent(cardId)}`;
  return { card: {
    pokemonId: pokemon.id, pokemonIds, pokemonName: pokemon.name, cardId,
    title: card.name, set: card.set?.name ?? 'set not provided',
    number: `${card.localId ?? '?'}/${card.set?.cardCount?.official ?? '?'}`,
    language: 'en', rarity: card.rarity ?? 'not provided', artist: card.illustrator,
    image, imageProvider: 'TCGdex', imageSha256: '', tcgdexUrl: sourceUrl,
    publisherCheck: 'not independently reviewed', artistEvidenceMethod: 'TCGdex metadata',
    artistEvidenceUrl: sourceUrl, artistObservedText: card.illustrator,
    prices: extractPrices(card.pricing, now), sourceType: 'catalog',
  } };
}

export function createArtistDiscovery(options = {}) {
  const cachedJson = createSourceCache(options);
  const scheduleDetail = createConcurrencyLimit(3);
  const now = options.now ?? Date.now;

  return async function discoverArtistCards(artist, offset = 0) {
    if (!isValidArtist(artist) || !isValidArtistOffset(offset)) throw new TypeError('invalid artist or page');
    const sourceUrl = `${ROOT}/illustrators/${encodeURIComponent(artist)}`;
    // Never use source.name as identity: this endpoint normalizes its label.
    // Include unsafe string IDs in coverage, but never send them upstream.
    const ids = await cachedJson(sourceUrl, undefined, source => {
      if (!Array.isArray(source?.cards) || source.cards.some(card => typeof card?.id !== 'string')) {
        throw new Error('invalid source artist index');
      }
      return [...new Set(source.cards.map(card => card.id))].sort(compareIds);
    });
    const batch = ids.slice(offset, offset + PAGE_SIZE);
    const results = await Promise.all(batch.map(async cardId => {
      if (!isSafeCardId(cardId)) return { cardId, reason: 'invalid_card_id' };
      try {
        const detail = await cachedJson(`${ROOT}/cards/${encodeURIComponent(cardId)}`, scheduleDetail);
        return { cardId, ...normalizeArtistCard(detail, artist, cardId, now()) };
      } catch {
        return { cardId, failed: true };
      }
    }));
    return {
      artist,
      cards: results.flatMap(result => result.card ? [result.card] : []),
      offset,
      nextOffset: offset + batch.length < ids.length ? offset + batch.length : null,
      total: ids.length,
      scanned: batch.length,
      failed: results.filter(result => result.failed).map(result => result.cardId),
      skipped: results.filter(result => result.reason).map(({ cardId, reason }) => ({ cardId, reason })),
      sourceUrl,
      fetchedAt: new Date(now()).toISOString(),
    };
  };
}

export const discoverArtistCards = createArtistDiscovery();
