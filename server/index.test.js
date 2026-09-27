import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.js';

test('catalog search and saved favorites work across requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pokedex-test-'));
  const server = createApp({ dataFile: join(directory, 'favorites.json'), serveClient: false }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const search = await fetch(`${base}/api/pokemon?q=char&type=fire`);
    assert.deepEqual((await search.json()).map(({ id }) => id), [4, 5, 6]);

    const add = await fetch(`${base}/api/favorites/4`, { method: 'POST' });
    assert.equal(add.status, 200);
    await fetch(`${base}/api/favorites/4`, { method: 'POST' });
    assert.deepEqual(await (await fetch(`${base}/api/favorites`)).json(), [4]);

    const invalid = await fetch(`${base}/api/favorites/999`, { method: 'POST' });
    assert.equal(invalid.status, 404);
    await fetch(`${base}/api/favorites/4`, { method: 'DELETE' });
    assert.deepEqual(await (await fetch(`${base}/api/favorites`)).json(), []);
  } finally {
    await new Promise((done) => server.close(done));
    await rm(directory, { recursive: true, force: true });
  }
});
