import { catalog } from './catalog.js';
import { isValidArtist } from './artist-discovery.js';

const safeCardId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
const speciesById = new Map(catalog.map(species => [species.id, species]));
const relatedSpecies = id => {
  const origin = speciesById.get(id);
  return catalog.filter(species => species.id !== id).sort((left, right) => {
    const affinity = species => species.types.some(type => origin.types.includes(type)) ? 0 : 1;
    return affinity(left) - affinity(right) || Math.abs(left.id - id) - Math.abs(right.id - id) || left.id - right.id;
  });
};

export function validTrailRequest(body) {
  if (!body || typeof body !== 'object' || !isValidArtist(body.artist) || !speciesById.has(body.speciesId) ||
    !Array.isArray(body.seen) || body.seen.length > 2000 || body.seen.some(id => !safeCardId(id)) ||
    !['artist', 'species', 'related'].includes(body.phase) || !Number.isSafeInteger(body.offset) || body.offset < 0 || body.offset > 100000 ||
    !Number.isSafeInteger(body.position) || body.position < 0 || body.position > 12) return false;
  return true;
}

export function createTrailDiscovery({ discoverArtist, discover }) {
  return async function nextTrail(body) {
    if (!validTrailRequest(body)) throw new TypeError('invalid trail request');
    const seen = new Set(body.seen);
    let { artist, speciesId, phase, offset, position } = body;
    let partial = false;
    // At most one artist and one species page in a request. Existing source
    // clients already cache calls, cap detail concurrency, and enforce timeout.
    for (let attempt = 0; attempt < 2; attempt++) {
      const related = phase === 'related' ? relatedSpecies(speciesId)[offset] : null;
      if (phase === 'related' && !related) return { card: null, cursor: null, exhausted: true, partial,
        coverage: { scanned: 0, total: 0 } };
      const page = phase === 'artist'
        ? await discoverArtist(artist, offset)
        : await discover(phase === 'related' ? related : speciesById.get(speciesId), phase === 'related' ? 0 : offset);
      partial ||= page.failed.length > 0;
      const candidates = [...page.cards].filter(card => safeCardId(card.cardId) && card.sourceType !== 'official')
        .sort((a, b) => {
          const relevance = card => phase === 'artist'
            ? ([card.pokemonId, ...(card.pokemonIds ?? [])].includes(speciesId) ? 1 : 0)
            : (card.artist === artist ? 1 : 0);
          return relevance(a) - relevance(b) || a.cardId.localeCompare(b.cardId);
        });
      const chosenIndex = candidates.findIndex((card, index) => index >= position && !seen.has(card.cardId));
      const card = chosenIndex < 0 ? null : candidates[chosenIndex];
      // Do not advance past an unavailable page and falsely report exhaustion.
      // An explicit retry receives the exact failed cursor.
      if (!card && page.failed.length) return { card: null, cursor: { artist, speciesId, phase, offset, position }, exhausted: false, partial: true, coverage: { scanned: page.scanned, total: page.total } };
      const remainingIndex = candidates.findIndex((candidate, index) => index > chosenIndex && !seen.has(candidate.cardId));
      const next = phase === 'related'
        ? (offset + 1 < catalog.length - 1 ? { artist, speciesId, phase: 'related', offset: offset + 1, position: 0 } : null)
        : card && remainingIndex >= 0
        ? { artist, speciesId, phase, offset, position: remainingIndex }
        : page.nextOffset !== null
          ? { artist, speciesId, phase, offset: page.nextOffset, position: 0 }
          : phase === 'artist'
            ? { artist, speciesId, phase: 'species', offset: 0, position: 0 }
            : { artist, speciesId, phase: 'related', offset: 0, position: 0 };
      if (card) {
        const context = phase === 'artist' ? `More by ${artist}` : phase === 'species'
          ? `Another take on ${speciesById.get(speciesId).name}` : `Related ${related.name} artwork`;
        // A new illustrator starts a new related-work branch after this card.
        const cursor = (phase === 'species' && card.artist !== artist) || phase === 'related'
          ? { artist: card.artist, speciesId: card.pokemonId, phase: 'artist', offset: 0, position: 0 }
          : next;
        return { card, context, reason: phase === 'artist' ? 'same illustrator' : phase === 'species' ? 'same Pokémon' : 'related Pokémon', cursor, exhausted: false,
          partial, coverage: { scanned: page.scanned, total: page.total } };
      }
      if (!next) return { card: null, cursor: null, exhausted: true, partial,
        coverage: { scanned: page.scanned, total: page.total } };
      if (phase === 'artist' && next.phase === 'species') {
        ({ artist, speciesId, phase, offset, position } = next);
        continue;
      }
      return { card: null, cursor: next, exhausted: false, partial,
        coverage: { scanned: page.scanned, total: page.total } };
    }
    throw new Error('trail request exceeded source bound');
  };
}
