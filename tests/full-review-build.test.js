import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isProtectedFullReviewPreview, isProtectedModelPreview } from '../scripts/preview-model-context.js';
import { PUBLIC_MODEL_MANIFEST_SHA256, verifyPublicModelManifest } from '../scripts/public-model-release.js';

test('whole-catalog review preserves exact released inventory and labels all 478 candidates without admission', async () => {
  const read = async name => JSON.parse(await readFile(new URL(`../content/models/${name}`, import.meta.url), 'utf8'));
  const publicBytes = await readFile(new URL('../content/models/protected-preview.json', import.meta.url));
  verifyPublicModelManifest(publicBytes);
  const publicIds = new Set(JSON.parse(publicBytes).assets.map(asset => asset.id));
  const candidates = await read('full-idle-candidates-2026-10-02.json');
  const visual = await read('full-review-visual-status-2026-10-02.json');
  const preflight = await read('full-review-canvas-preflight-2026-10-02.json');
  const restored = await read('home-original-scene-review-2026-10-02.json');
  const sparse = await read('home-raw-scene-source-inputs-2026-10-02.json');
  const source = await read('atlas-source-catalog-2026-10-02.json');
  assert.equal(PUBLIC_MODEL_MANIFEST_SHA256, '69264fdafa834db8dc0d946901971ac01b0f1a3ae1f7dc820f7bbc5c1076e4a4');
  assert.equal(source.records.length, 1025);
  assert.equal(candidates.candidates.length, 478);
  assert.equal(visual.entries.length, 478);
  assert.deepEqual(visual.counts, { pass: 431, uncertain: 12, hold: 35 });
  assert.equal(preflight.pass, 478);
  assert.equal(preflight.hold, 0);
  assert.deepEqual(restored.counts, { candidates: 40, standardTransfer: 31, exactPreviewTransferExceptions: 9,
    sourceLayerEquationHolds: 17, metadataPreflightPass: 23, specialAtlasCompatibilitySpecies: 7 });
  assert.deepEqual(restored.rows.filter(item => item.materialCorrectionStatus.startsWith('held')).map(item => item.id),
    [219, 477, 698, 699, 716, 718, 802, 826, 839, 869, 935, 954, 990, 991, 1022, 1023, 1024]);
  assert.deepEqual(restored.rows.filter(item => item.derivative.bytes > 750000).map(item => item.id),
    [219, 718, 864, 993, 1008, 1010, 1012, 1022, 1023]);
  assert.equal(sparse.species, 40);
  assert.equal(sparse.rows.length, 40);
  assert.equal(sparse.uniqueTextures, 325);
  assert.equal(sparse.upstreamMap.sha256, '0b52b67120625b21d8e0f17c632897118b39adad02b175837fb90a95ae7f5983');
  assert.equal(new Set(sparse.rows.map(item => item.id)).size, 40);
  assert.deepEqual(sparse.rows.map(item => item.id), restored.rows.map(item => item.id));
  assert.ok(sparse.rows.every(item => item.geometry.sha256 && item.atlas.sha256 && item.textures.every(texture => texture.sha256 && texture.blobSha)));
  assert.equal(candidates.candidates.filter(item => publicIds.has(item.id)).length, 0);
  const byId = new Map(visual.entries.map(item => [item.id, item]));
  for (const item of candidates.candidates) {
    assert.ok(byId.has(item.id));
    assert.equal(item.review.protectedPreviewAdmitted, false);
    assert.equal(item.review.publicReleased, false);
    assert.equal(item.nativeIdle.name, 'HOME Idle');
    assert.equal(item.source.bytes > 0, true);
    assert.equal(item.prepared.bytes <= 750000, true);
  }
  assert.deepEqual(candidates.candidates.filter(item => item.source.bytes > 750000).map(item => item.id), [78, 851, 894, 1008]);
  assert.deepEqual(candidates.candidates.filter(item => item.nativeIdle.sourceAuthoredStationaryWait).map(item => item.id), [597]);
});

test('review-only build gate requires the observed SSO-protected branch and preview environment', () => {
  const valid = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/pokedex-full-coverage-20261002',
    VERCEL_BRANCH_URL: 'pokedex-review-git-codex-pokedex-full-coverage-20261002-zarnab.vercel.app' };
  assert.equal(isProtectedFullReviewPreview(valid), true);
  assert.equal(isProtectedModelPreview(valid), true);
  for (const changed of [{ VERCEL_ENV: 'production' }, { VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL_BRANCH_URL: 'unprotected.example' }]) assert.equal(isProtectedFullReviewPreview({ ...valid, ...changed }), false);
});
