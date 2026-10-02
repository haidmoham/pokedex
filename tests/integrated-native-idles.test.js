import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INTEGRATED_MODEL_RELEASE, isIntegratedModelRelease } from '../scripts/public-model-release.js';

const read = async name => JSON.parse(await readFile(new URL(`../content/models/${name}.json`, import.meta.url)));
test('full native-idle selection complements the exact earlier release without altering its source manifest', async () => {
  const normal = await read('admitted');
  const base = await read('protected-preview');
  const candidates = await read('full-idle-candidates-2026-10-02');
  const visual = await read('full-review-visual-status-2026-10-02');
  const original = await read('home-original-scene-review-2026-10-02');
  const prior = new Map([...normal, ...base.assets].filter(item => item.admitted).map(item => [item.id, item]));
  assert.equal(prior.size, 998);
  assert.equal([...prior.values()].filter(item => item.animation).length, 547);
  assert.equal(candidates.candidates.length, 478);
  assert.equal(new Set(candidates.candidates.map(item => item.id)).size, 478);
  assert.equal(candidates.candidates.filter(item => !prior.has(item.id)).length, 27);
  assert.equal(candidates.candidates.filter(item => prior.has(item.id) && !prior.get(item.id).animation).length, 451);
  assert.equal(candidates.candidates.filter(item => prior.get(item.id)?.animation).length, 0);
  assert.equal([...new Set([...prior.keys(), ...candidates.candidates.map(item => item.id)])].length, 1025);
  assert.deepEqual(visual.counts, { pass: 431, uncertain: 12, hold: 35 });
  assert.deepEqual(candidates.candidates.filter(item => item.nativeIdle.sourceAuthoredStationaryWait).map(item => item.id), [597]);
  assert.ok(candidates.candidates.every(item => item.nativeIdle.name === 'HOME Idle' && item.nativeIdle.channels > 0 &&
    item.source.sha256.length === 64 && item.originalHome.nativeWait.sha256.length === 64));
  const correctionIds = [990, 992, 993, 1006, 1022];
  assert.ok(correctionIds.every(id => candidates.candidates.some(item => item.id === id) &&
    original.rows.some(item => item.id === id && item.derivative.bytes < 2_000_000 && item.derivative.sha256.length === 64)));
});

test('only the exact release flag opens normal-feed integration', () => {
  assert.equal(isIntegratedModelRelease({}), false);
  assert.equal(isIntegratedModelRelease({ POKEDEX_MODEL_RELEASE: '2026-10-01-998' }), false);
  assert.equal(isIntegratedModelRelease({ POKEDEX_MODEL_RELEASE: INTEGRATED_MODEL_RELEASE }), true);
});
