import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtistDiscovery, normalizeArtistCard, isValidArtist } from '../server/artist-discovery.js';

const ARTIST = 'Mitsuhiro Arita';
const now = Date.parse('2026-09-30T00:00:00Z');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = value => ({ ok: true, json: async () => value });
const rawCard = (id, changes = {}) => ({
  id, name: 'Pikachu & Zekrom-GX', illustrator: ARTIST, category: 'Pokemon',
  dexId: [25, 644], localId: '1', set: { name: 'Example', cardCount: { official: 20 } },
  image: 'https://assets.tcgdex.net/en/example/1', ...changes,
});
const ids = count => Array.from({ length: count }, (_, index) => `set-${String(index).padStart(2, '0')}`);
const service = fetcher => createArtistDiscovery({ fetcher, now: () => now, backoffMs: 0 });

test('artist pages hydrate twelve unique candidates with at most three simultaneous details', async () => {
  const sourceIds = ids(27);
  let active = 0, maximum = 0, indexCalls = 0;
  const requested = [];
  const discover = service(async url => {
    if (url.includes('/illustrators/')) {
      indexCalls++;
      return json({ name: 'mitsuhiro arita', cards: [...sourceIds].reverse().concat(sourceIds[3]).map(id => ({ id })) });
    }
    const id = url.split('/').at(-1);
    requested.push(id);
    active++; maximum = Math.max(maximum, active);
    await pause((27 - sourceIds.indexOf(id)) % 4 + 1);
    active--;
    return json(rawCard(id));
  });
  const first = await discover(ARTIST);
  assert.equal(first.total, 27);
  assert.equal(first.scanned, 12);
  assert.equal(first.nextOffset, 12);
  assert.equal(first.artist, ARTIST);
  assert.equal(first.sourceUrl, 'https://api.tcgdex.net/v2/en/illustrators/Mitsuhiro%20Arita');
  assert.equal(first.fetchedAt, new Date(now).toISOString());
  assert.deepEqual(first.cards.map(card => card.cardId), sourceIds.slice(0, 12));
  assert.equal(requested.length, 12, 'opening one page must not hydrate the whole portfolio');
  // The limit is shared across independent simultaneous pages as well.
  const [second, third] = await Promise.all([discover(ARTIST, 12), discover(ARTIST, 24)]);
  assert.deepEqual(second.cards.map(card => card.cardId), sourceIds.slice(12, 24));
  assert.deepEqual(third.cards.map(card => card.cardId), sourceIds.slice(24));
  assert.equal(third.scanned, 3);
  assert.equal(third.nextOffset, null);
  assert.equal(indexCalls, 1);
  assert.equal(maximum, 3);
  assert.equal(requested.length, 27);
});

test('literal detail credit determines membership, never the normalized index label or summary fields', async () => {
  const discover = service(async url => url.includes('/illustrators/')
    ? json({ name: 'mitsuhiro arita', cards: [
      { id: 'set-1', illustrator: 'wrong summary', dexId: [999], image: 'https://untrusted.test/summary' },
      { id: 'set-2', illustrator: ARTIST, dexId: [25] },
      { id: 'set-3', illustrator: ARTIST, dexId: [25] },
    ] })
    : json(rawCard(url.split('/').at(-1), url.endsWith('set-2') ? { illustrator: 'mitsuhiro arita' }
      : url.endsWith('set-3') ? { illustrator: undefined } : {})));
  const result = await discover(ARTIST);
  assert.deepEqual(result.cards.map(card => [card.cardId, card.artist]), [['set-1', ARTIST]]);
  assert.deepEqual(result.skipped, [
    { cardId: 'set-2', reason: 'artist_credit_mismatch' },
    { cardId: 'set-3', reason: 'missing_artist_credit' },
  ]);
  assert.equal(result.cards.length + result.skipped.length + result.failed.length, result.scanned);
});

test('shared card keeps every valid species and deterministically anchors the real catalog name', () => {
  const { card } = normalizeArtistCard(rawCard('set-1', { dexId: [644, 25, 25, 1025, 0, -1, 1026, '94', 1.5] }), ARTIST, 'set-1', now);
  assert.deepEqual(card.pokemonIds, [25, 644, 1025]);
  assert.equal(card.pokemonId, 25);
  assert.equal(card.pokemonName, 'Pikachu');
  assert.equal(card.title, 'Pikachu & Zekrom-GX');
  assert.equal(card.sourceType, 'catalog');
  assert.equal(card.publisherCheck, 'not independently reviewed');
  assert.equal(card.artistObservedText, ARTIST);
  assert.equal(card.artistEvidenceUrl, 'https://api.tcgdex.net/v2/en/cards/set-1');
  assert.equal(card.image, 'https://assets.tcgdex.net/en/example/1/high.webp');
  assert.equal(card.imageSha256, '');
});

test('bad IDs, trainers, missing species, mismatched card identity and invalid artwork are explicit skips', async () => {
  const invalids = new Map([
    ['set-1', { category: 'Trainer', dexId: [25] }],
    ['set-2', { dexId: [0, 1026, '25'] }],
    ['set-3', { image: undefined }],
    ['set-4', { image: 'https://assets.tcgdex.net.evil.test/en/a/1' }],
    ['set-5', { image: 'http://assets.tcgdex.net/en/a/1' }],
    ['set-6', { id: 'other-card' }],
  ]);
  const detailRequests = [];
  const discover = service(async url => {
    if (url.includes('/illustrators/')) return json({ cards: ['../escape', 'set-0', ...invalids.keys(), '../escape'].map(id => ({ id })) });
    const id = url.split('/').at(-1);
    detailRequests.push(id);
    return json(rawCard(id, invalids.get(id)));
  });
  const result = await discover(ARTIST);
  assert.equal(result.total, 8);
  assert.equal(result.scanned, 8);
  assert.equal(detailRequests.length, 7);
  assert.deepEqual(result.cards.map(card => card.cardId), ['set-0']);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.skipped, [
    { cardId: '../escape', reason: 'invalid_card_id' },
    { cardId: 'set-1', reason: 'not_pokemon' },
    { cardId: 'set-2', reason: 'no_valid_species' },
    { cardId: 'set-3', reason: 'invalid_artwork' },
    { cardId: 'set-4', reason: 'invalid_artwork' },
    { cardId: 'set-5', reason: 'invalid_artwork' },
    { cardId: 'set-6', reason: 'invalid_card_id' },
  ]);
});

test('artwork validation rejects credential, query, port, dot-segment and encoded-host tricks', () => {
  for (const image of [
    'https://assets.tcgdex.net@evil.test/en/a/1', 'https://user@assets.tcgdex.net/en/a/1',
    'https://assets.tcgdex.net:444/en/a/1', 'https://assets.tcgdex.net/en/a/1?redirect=evil',
    'https://assets.tcgdex.net/en/a/1#fragment', 'https://assets.tcgdex.net/en/../a/1',
    'https://assets.tcgdex.net/en//a/1', 'https://assets.tcgdex.net/%2E%2E/a/1',
  ]) {
    assert.equal(normalizeArtistCard(rawCard('set-1', { image }), ARTIST, 'set-1').reason, 'invalid_artwork', image);
  }
});

test('artist discovery reuses the existing fresh, currency-specific price normalization', () => {
  const { card } = normalizeArtistCard(rawCard('set-1', { pricing: {
    tcgplayer: { unit: 'USD', updated: '2026-09-29', normal: { marketPrice: 25, productId: 123 } },
    cardmarket: { unit: 'EUR', updated: '2020-01-01', trend: 999 },
  } }), ARTIST, 'set-1', now);
  assert.deepEqual(card.prices.map(price => [price.amount, price.currency]), [[25, 'USD']]);
  assert.equal(card.prices[0].url, 'https://www.tcgplayer.com/product/123');
});

test('simultaneous requests deduplicate index and detail reads in flight and subsequent cache hits', async () => {
  const counts = new Map();
  const discover = service(async url => {
    counts.set(url, (counts.get(url) ?? 0) + 1);
    await pause(2);
    return json(url.includes('/illustrators/') ? { cards: ids(12).map(id => ({ id })) } : rawCard(url.split('/').at(-1)));
  });
  const [first, concurrent] = await Promise.all([discover(ARTIST), discover(ARTIST)]);
  assert.deepEqual(first, concurrent);
  assert.deepEqual(await discover(ARTIST), first);
  assert.equal(counts.size, 13);
  assert.ok([...counts.values()].every(count => count === 1));
});

test('cache expires and refreshes both index and detail JSON', async () => {
  let clock = now, requests = 0;
  const discover = createArtistDiscovery({ ttlMs: 100, now: () => clock, fetcher: async url => {
    requests++;
    return json(url.includes('/illustrators/') ? { cards: [{ id: 'set-1' }] } : rawCard('set-1'));
  } });
  await discover(ARTIST); await discover(ARTIST);
  assert.equal(requests, 2);
  clock += 101;
  await discover(ARTIST);
  assert.equal(requests, 4);
});

test('bounded transient retries recover while permanent failures remain retryable on the same page', async () => {
  const counts = new Map();
  let available = false;
  const delays = [];
  const discover = createArtistDiscovery({ now: () => now, delay: async ms => delays.push(ms), fetcher: async url => {
    counts.set(url, (counts.get(url) ?? 0) + 1);
    if (url.includes('/illustrators/')) return json({ cards: ids(14).map(id => ({ id })) });
    const id = url.split('/').at(-1);
    if (id === 'set-01' && counts.get(url) === 1) return { ok: false, status: 503 };
    if (id === 'set-03' && !available) return { ok: false, status: 503 };
    if (id === 'set-07' && !available) return { ok: false, status: 404 };
    return json(rawCard(id));
  } });
  const first = await discover(ARTIST);
  assert.deepEqual(first.failed, ['set-03', 'set-07']);
  assert.equal(first.nextOffset, 12);
  assert.equal(counts.get('https://api.tcgdex.net/v2/en/cards/set-03'), 2);
  assert.equal(counts.get('https://api.tcgdex.net/v2/en/cards/set-07'), 1, '404 is not automatically retried');
  assert.deepEqual(delays, [150, 150]);
  // The user may load later candidates before retrying this exact failed page.
  const second = await discover(ARTIST, first.nextOffset);
  available = true;
  const retry = await discover(ARTIST, first.offset);
  assert.equal(retry.offset, 0);
  assert.equal(retry.nextOffset, 12);
  assert.deepEqual(retry.failed, []);
  assert.deepEqual([...retry.cards, ...second.cards].map(card => card.cardId), ids(14));
  assert.equal(counts.get('https://api.tcgdex.net/v2/en/cards/set-00'), 1, 'successful details must not refetch');
  assert.equal(counts.get('https://api.tcgdex.net/v2/en/cards/set-03'), 3);
  assert.equal(counts.get('https://api.tcgdex.net/v2/en/cards/set-07'), 2);
});

test('detail timeouts cover stalled JSON bodies and stop after one bounded retry', async () => {
  let attempts = 0, aborted = 0;
  const discover = createArtistDiscovery({ timeoutMs: 5, backoffMs: 0, fetcher: async (url, { signal }) => {
    if (url.includes('/illustrators/')) return json({ cards: [{ id: 'set-1' }] });
    attempts++;
    signal.addEventListener('abort', () => aborted++);
    return { ok: true, json: () => new Promise(() => {}) };
  } });
  const result = await discover(ARTIST);
  assert.deepEqual(result.failed, ['set-1']);
  assert.equal(attempts, 2);
  assert.equal(aborted, 2);
  assert.equal(result.scanned, 1);
});

test('source outages are not cached and malformed indexes never silently lose coverage', async () => {
  let requests = 0;
  const discover = service(async () => {
    requests++;
    return requests <= 2 ? { ok: false, status: 503 } : json({ cards: [] });
  });
  await assert.rejects(discover(ARTIST), /source returned 503/);
  const recovered = await discover(ARTIST);
  assert.equal(recovered.total, 0);
  assert.equal(requests, 3);
  for (const malformed of [[], { cards: null }, { cards: [{}] }, { cards: [{ id: 123 }] }]) {
    let first = true;
    const recover = service(async () => {
      const response = first ? malformed : { cards: [] };
      first = false;
      return json(response);
    });
    await assert.rejects(recover(ARTIST), /invalid source artist index/);
    assert.equal((await recover(ARTIST)).total, 0, 'malformed indexes must not remain cached');
  }
});

test('empty and past-end pages are honest and invalid inputs never call the source', async () => {
  let calls = 0;
  const discover = service(async () => { calls++; return json({ cards: [{ id: 'set-1' }] }); });
  const end = await discover(ARTIST, 12);
  assert.equal(end.total, 1);
  assert.equal(end.scanned, 0);
  assert.equal(end.nextOffset, null);
  assert.deepEqual(end.cards, []);
  assert.equal(calls, 1);
  for (const artist of ['', ' ', ' padded', 'padded ', 'line\nbreak', 'hidden\u200Bname', '.', '..', 'a'.repeat(121)]) {
    assert.equal(isValidArtist(artist), false);
    await assert.rejects(discover(artist), /invalid artist or page/);
  }
  for (const offset of [-1, 0.5, NaN, Infinity, 100001, '12']) await assert.rejects(discover(ARTIST, offset), /invalid artist or page/);
  assert.equal(calls, 1);
  for (const artist of ['5ban Graphics', 'Naoki Saito', 'Ｋｉｎｕｋｏ', 'Artist & Studio']) assert.equal(isValidArtist(artist), true);
});
