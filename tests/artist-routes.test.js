import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

async function withServer(discoverArtist, run) {
  const server = createApp({ serveClient: false, stateless: true, discoverArtist }).listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(done => server.close(done));
  }
}

test('artist route preserves exact credit, validates offsets and returns the portfolio contract', async () => {
  const requests = [];
  const data = { artist: 'Mitsuhiro Arita', cards: [], offset: 12, nextOffset: 24, total: 741, scanned: 12,
    failed: [], skipped: [{ cardId: 'set-1', reason: 'not_pokemon' }],
    sourceUrl: 'https://api.tcgdex.net/v2/en/illustrators/Mitsuhiro%20Arita', fetchedAt: '2026-09-30T00:00:00Z' };
  await withServer(async (artist, offset) => { requests.push([artist, offset]); return data; }, async base => {
    const response = await fetch(`${base}/api/artists/Mitsuhiro%20Arita?offset=12`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), data);
    assert.match(response.headers.get('cache-control'), /s-maxage=1800/);
    assert.deepEqual(requests, [['Mitsuhiro Arita', 12]]);
    await fetch(`${base}/api/artists/Mitsuhiro%20Arita`);
    assert.deepEqual(requests[1], ['Mitsuhiro Arita', 0]);
  });
});

test('artist route rejects invalid artist names and ambiguous pagination without upstream calls', async () => {
  let calls = 0;
  await withServer(async () => { calls++; return { failed: [] }; }, async base => {
    const paths = [
      'Artist?offset=-1', 'Artist?offset=1.5', 'Artist?offset=1e2', 'Artist?offset=',
      'Artist?offset=12x', 'Artist?offset=00', 'Artist?offset=100001',
      'Artist?offset=1&offset=2', 'Artist?offset[value]=1',
      '%20', '%20Artist', 'Artist%20', 'Artist%00Name', 'Artist%0AName',
      'Artist%E2%80%8BName', 'a'.repeat(121),
    ];
    for (const path of paths) {
      const response = await fetch(`${base}/api/artists/${path}`);
      assert.equal(response.status, 400, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match((await response.json()).error, /invalid artist or page/);
    }
    assert.equal(calls, 0);
  });
});

test('partial artist pages bypass CDN caching and retrying the same offset can recover', async () => {
  let calls = 0;
  await withServer(async (artist, offset) => ({ artist, offset, cards: [], failed: ++calls === 1 ? ['set-1'] : [], skipped: [] }), async base => {
    const first = await fetch(`${base}/api/artists/Artist?offset=12`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await first.json()).failed, ['set-1']);
    const retry = await fetch(`${base}/api/artists/Artist?offset=12`);
    assert.match(retry.headers.get('cache-control'), /s-maxage=1800/);
    assert.deepEqual((await retry.json()).failed, []);
  });
});

test('artist source outages return 502 with no-store and no invented empty portfolio', async () => {
  await withServer(async () => { throw new Error('source unavailable'); }, async base => {
    const response = await fetch(`${base}/api/artists/Artist`);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match((await response.json()).error, /artist card source unavailable/);
  });
});

test('malformed artist URL encoding returns a non-cacheable client error', async () => {
  await withServer(async () => { throw new Error('must not call source'); }, async base => {
    const response = await fetch(`${base}/api/artists/%E0%A4%A`);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'invalid request encoding', code: 'REQUEST_ENCODING_INVALID' });
  });
});

test('Vercel rewrite path metadata does not invalidate a valid artist page', async () => {
  const calls=[];
  await withServer(async (artist,offset)=>{calls.push([artist,offset]);return {artist,offset,cards:[],failed:[],skipped:[]};},async base=>{
    // /api/:path* -> /api/index forwards its named capture in the query string.
    // It is routing metadata, never a source query or artist identity.
    const response=await fetch(`${base}/api/artists/Mitsuhiro%20Arita?offset=12&path=artists%2FMitsuhiro%20Arita`);
    assert.equal(response.status,200);
    assert.deepEqual(calls,[['Mitsuhiro Arita',12]]);
    const malformed=await fetch(`${base}/api/artists/Mitsuhiro%20Arita?offset[value]=12&path=artists%2FMitsuhiro%20Arita`);
    assert.equal(malformed.status,400);
    assert.equal(calls.length,1);
  });
});

test('artist validation diagnostics identify the failed boundary and reveal query keys only', async () => {
  let calls = 0;
  await withServer(async () => { calls++; return { failed: [] }; }, async base => {
    const cases = [
      ['%20Artist?offset=0', 'artist', []],
      ['Artist?offset=-1', 'offset', []],
      ['Artist?offset=1&offset=2', 'offset', []],
      ['Artist?offset[value]=private-offset-value&path=ignored-private-path', 'unexpected_query', ['offset[value]']],
      ['Artist?zeta=private-zeta-value&alpha=private-alpha-value&offset=0&path=ignored-private-path', 'unexpected_query', ['alpha', 'zeta']],
      ['%20Artist?offset=-1&unknown=private-value', 'artist', ['unknown']],
    ];
    for (const [path, reason, unexpectedKeys] of cases) {
      const response = await fetch(`${base}/api/artists/${path}`);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {
        error: 'invalid artist or page', code: 'ARTIST_REQUEST_INVALID', reason, unexpectedKeys,
      });
    }
    assert.equal(calls, 0);
  });
});

test('artist upstream diagnostics distinguish source statuses, timeout, index shape and unavailable failures', async () => {
  const cases = [
    [new Error('source request timed out'), 'ARTIST_SOURCE_TIMEOUT'],
    [new DOMException('private-timeout-detail', 'TimeoutError'), 'ARTIST_SOURCE_TIMEOUT'],
    [new DOMException('private-abort-detail', 'AbortError'), 'ARTIST_SOURCE_TIMEOUT'],
    [new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'ARTIST_SOURCE_TIMEOUT'],
    [new Error('invalid source artist index'), 'ARTIST_SOURCE_INDEX_INVALID'],
    [new SyntaxError('private malformed JSON body'), 'ARTIST_SOURCE_INDEX_INVALID'],
    [new Error('source returned 404'), 'ARTIST_SOURCE_NOT_FOUND'],
    [new Error('source returned 401'), 'ARTIST_SOURCE_UNAUTHORIZED'],
    [new Error('source returned 403'), 'ARTIST_SOURCE_FORBIDDEN'],
    [new Error('source returned 429'), 'ARTIST_SOURCE_RATE_LIMITED'],
    [new Error('source returned 503'), 'ARTIST_SOURCE_UNAVAILABLE'],
    [new Error('private request URL https://example.test/?token=private-value'), 'ARTIST_SOURCE_UNAVAILABLE'],
    [new Error('toString'), 'ARTIST_SOURCE_UNAVAILABLE'],
    [null, 'ARTIST_SOURCE_UNAVAILABLE'],
  ];
  for (const [error, code] of cases) {
    await withServer(async () => { throw error; }, async base => {
      const response = await fetch(`${base}/api/artists/Artist`);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {
        error: 'artist card source unavailable; loaded artwork remains available', code,
      });
    });
  }
});
