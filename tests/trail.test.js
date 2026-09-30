import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrailDiscovery, validTrailRequest } from '../server/trail.js';
import { createApp } from '../server/app.js';

const start = { artist: 'Mitsuhiro Arita', speciesId: 1, phase: 'artist', offset: 0, position: 0, seen: ['already'] };
const card = (cardId, pokemonId, artist = 'Mitsuhiro Arita') => ({ cardId, pokemonId, artist, sourceType: 'catalog', image: `https://assets.tcgdex.net/en/test/${cardId}/high.webp` });
const page = (cards, nextOffset = null) => ({ cards, nextOffset, scanned: 12, total: nextOffset === null ? 12 : 24, failed: [] });

test('trail input is bounded and rejects malformed context or seen identities', () => {
  assert.equal(validTrailRequest(start), true);
  for (const change of [{ artist: '' }, { speciesId: 1026 }, { phase: 'other' }, { offset: -1 }, { position: 13 }, { seen: ['../../unsafe'] }, { seen: Array(2001).fill('valid') }]) {
    assert.equal(validTrailRequest({ ...start, ...change }), false);
  }
});

test('same illustrator crosses into unseen species first, then follows stable page cursor', async () => {
  const calls = [];
  const next = createTrailDiscovery({
    discoverArtist: async (artist, offset) => { calls.push([artist, offset]); return page([card('already', 1), card('same', 1), card('other', 2)]); },
    discover: async () => { throw new Error('should not be called'); },
  });
  const first = await next(start);
  assert.equal(first.card.cardId, 'other');
  assert.equal(first.context, 'More by Mitsuhiro Arita');
  assert.equal(first.reason, 'same illustrator');
  assert.deepEqual(first.cursor, { artist: start.artist, speciesId: 1, phase: 'artist', offset: 0, position: 2 });
  const second = await next({ ...first.cursor, seen: [...start.seen, first.card.cardId] });
  assert.equal(second.card.cardId, 'same');
  assert.equal(second.cursor.phase, 'species');
  assert.deepEqual(calls, [[start.artist, 0], [start.artist, 0]]);
});

test('artist exhaustion falls through to a different illustrator on the same Pokémon', async () => {
  let artistCalls = 0, speciesCalls = 0;
  const next = createTrailDiscovery({
    discoverArtist: async () => { artistCalls++; return page([card('already', 1)]); },
    discover: async () => { speciesCalls++; return page([card('new-view', 1, 'Ken Sugimori')]); },
  });
  const result = await next(start);
  assert.equal(result.card.cardId, 'new-view');
  assert.equal(result.context, 'Another take on Bulbasaur');
  assert.deepEqual(result.cursor, { artist: 'Ken Sugimori', speciesId: 1, phase: 'artist', offset: 0, position: 0 });
  assert.equal(artistCalls, 1);
  assert.equal(speciesCalls, 1);
});

test('an exhausted illustrator and species branch continues to related species without recycling seen art', async () => {
  const next = createTrailDiscovery({ discoverArtist: async () => page([card('already', 1)]), discover: async () => page([card('already', 1)]) });
  const result = await next(start);
  assert.equal(result.card, null);
  assert.equal(result.exhausted, false);
  assert.deepEqual(result.cursor, { artist: start.artist, speciesId: 1, phase: 'related', offset: 0, position: 0 });
  const finite = await next({ ...result.cursor, offset: 1024, seen: start.seen });
  assert.equal(finite.card, null);
  assert.equal(finite.exhausted, true);
});

test('related-species fallback picks a real nearby type and opens its illustrator context', async () => {
  const called = [];
  const next = createTrailDiscovery({
    discoverArtist: async () => { throw new Error('should not be called'); },
    discover: async species => { called.push(species.id); return page([card('related-art', species.id, 'Ken Sugimori')]); },
  });
  const result = await next({ ...start, phase: 'related', offset: 0, position: 0 });
  assert.deepEqual(called, [2]);
  assert.equal(result.card.cardId, 'related-art');
  assert.equal(result.context, 'Related Ivysaur artwork');
  assert.equal(result.cursor.artist, 'Ken Sugimori');
});

test('Vercel rewrite path query metadata is ignored by the trail adapter', async () => {
  const server = createApp({ serveClient: false, discoverTrail: async body => ({ card: card('next', body.speciesId), cursor: null, exhausted: false }) }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/trail?path=trail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(start) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).card.cardId, 'next');
    const invalid = await fetch(`${base}/api/trail?extra=no`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(start) });
    assert.equal(invalid.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('an unavailable empty page keeps the exact cursor retryable and never claims exhaustion', async () => {
  let failed = true;
  const next = createTrailDiscovery({
    discoverArtist: async () => failed ? { ...page([]), failed: ['unavailable'] } : page([card('recovered', 2)]),
    discover: async () => { throw new Error('failed page must not be skipped'); },
  });
  const outage = await next(start);
  assert.equal(outage.card, null);
  assert.equal(outage.exhausted, false);
  assert.equal(outage.partial, true);
  assert.deepEqual(outage.cursor, { artist: start.artist, speciesId: 1, phase: 'artist', offset: 0, position: 0 });
  failed = false;
  const recovery = await next({ ...outage.cursor, seen: start.seen });
  assert.equal(recovery.card.cardId, 'recovered');
  assert.equal(recovery.partial, false);
});
