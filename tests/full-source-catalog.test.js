import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyPublicModelManifest } from '../scripts/public-model-release.js';

const load = async name => JSON.parse(await readFile(new URL(`../content/models/${name}`, import.meta.url), 'utf8'));

test('pinned Atlas and original HOME source inventories cover every species and wait clip', async () => {
  const [tree, catalog, companions, pointers, acquisition, runtime] = await Promise.all([
    load('atlas-normal-source-tree-2026-10-02.json'), load('atlas-source-catalog-2026-10-02.json'),
    load('home-core-source-catalog-2026-10-02.json'), load('home-upstream-metadata-pointers-2026-10-02.json'),
    load('home-source-acquisition-2026-10-02.json'), load('atlas-runtime-audit-2026-10-02.json'),
  ]);
  const all = Array.from({ length: 1025 }, (_, index) => index + 1);
  assert.deepEqual(tree.assets.map(asset => asset.id), all);
  assert.deepEqual(catalog.records.map(asset => asset.id), all);
  assert.deepEqual(companions.records.map(asset => asset.id), all);
  assert.deepEqual(runtime.results.map(asset => asset.id), all);
  assert.equal(tree.sourceBytes, 188932296);
  assert.equal(acquisition.originalGeometry.species, 1025);
  assert.equal(acquisition.originalCompanions.files, 16991);
  assert.equal(acquisition.chosenOriginalNativeWaits, 1025);
  assert.equal(pointers.materialMotionTreeSha, 'd8df2b3ea3d70fa8e6c0984fc3c29d5e1856e902');
  assert.ok(pointers.files.some(file => file.path === 'atlas/scripts/data/home-sources.json' &&
    file.sha256 === '0b52b67120625b21d8e0f17c632897118b39adad02b175837fb90a95ae7f5983'));
  assert.equal(companions.materialReferences, 7504);
  assert.equal(companions.textureReferences, 5610);
  assert.equal(companions.animationReferences, 3877);
  for (let index = 0; index < 1025; index++) {
    const atlas = catalog.records[index], treeAsset = tree.assets[index], raw = companions.records[index];
    assert.equal(atlas.atlas.blobSha, treeAsset.blobSha);
    assert.equal(atlas.atlas.bytes, treeAsset.bytes);
    assert.match(atlas.atlas.sha256, /^[0-9a-f]{64}$/);
    assert.equal(atlas.gltf.animations.length, 1);
    assert.equal(atlas.gltf.animations[0].name, 'HOME Idle');
    assert.ok(atlas.gltf.animations[0].nativeDuration > 0 && atlas.gltf.animations[0].channels > 0);
    assert.match(raw.geometry.sha256, /^[0-9a-f]{64}$/);
    assert.match(raw.nativeWait.sha256, /^[0-9a-f]{64}$/);
    assert.ok(raw.nativeWait.path.endsWith('_ba10_waitA01.anim'));
    assert.equal(runtime.results[index].sourceSha256, atlas.atlas.sha256);
    assert.equal(runtime.results[index].derivativeSha256, atlas.sourceOnlyTrim.sha256);
    assert.ok(runtime.results[index].movingSamplers > 0 || atlas.id === 597);
  }
  assert.equal(runtime.counts.sources, 1025);
  assert.equal(runtime.counts.existingStructurePass, 1025);
  assert.equal(runtime.counts.decodedTexturePass, 1025);
  assert.equal(runtime.counts.decodedGeometryAndIdlePass, 1025);
  assert.equal(runtime.counts.actualMovingNativeIdle, 1024);
  assert.equal(runtime.results[596].id, 597);
  assert.equal(runtime.results[596].movingSamplers, 0);
  assert.equal(runtime.counts.transferBudgetPass, 1019);
});

test('full source catalog makes no wider public extracted-asset release', async () => {
  const bytes = await readFile(new URL('../content/models/protected-preview.json', import.meta.url));
  verifyPublicModelManifest(bytes);
  const ordinary = await load('admitted.json');
  const released = JSON.parse(bytes).assets;
  const effective = new Map([...ordinary, ...released].filter(asset => asset.admitted).map(asset => [asset.id, asset]));
  assert.equal(effective.size, 998);
  assert.equal([...effective.values()].filter(asset => asset.animation).length, 547);
});

test('all six whole-catalog transfer exceptions have separate under-cap identities', async () => {
  const [repairs, catalog] = await Promise.all([
    load('atlas-transfer-repair-2026-10-02.json'), load('atlas-source-catalog-2026-10-02.json'),
  ]);
  assert.deepEqual(repairs.results.map(item => item.id), [78, 717, 851, 894, 914, 1008]);
  for (const repair of repairs.results) {
    const source = catalog.records[repair.id - 1];
    assert.equal(repair.sourceSha256, source.atlas.sha256);
    assert.ok(repair.trimmedBytes > 750000);
    assert.ok(repair.prepared.bytes <= 750000);
    assert.match(repair.prepared.sha256, /^[0-9a-f]{64}$/);
    assert.equal(repair.rightsStatus, 'unresolved');
  }
});

test('the complete native-idle gap remains a candidate queue, not an inflated admission count', async () => {
  const queue = await load('full-idle-candidates-2026-10-02.json');
  assert.equal(queue.counts.nativeIdleCandidates, 478);
  assert.equal(queue.candidates.length, 478);
  assert.equal(queue.candidates.filter(item => item.currentPublicRuntime === 'static').length, 451);
  assert.equal(queue.candidates.filter(item => item.currentPublicRuntime === 'absent').length, 27);
  assert.equal(queue.counts.visibleMovingNativeIdle, 477);
  assert.equal(queue.counts.sourceAuthoredStationaryNativeWait, 1);
  assert.equal(queue.candidates.find(item => item.id === 597)?.nativeIdle.sourceAuthoredStationaryWait, true);
  assert.ok(queue.candidates.every(item => item.nativeIdle.name === 'HOME Idle' &&
    item.nativeIdle.nativeDuration > 0 && item.prepared.bytes <= 750000 &&
    (item.decodedResourceChecks.movingNativeIdle || item.nativeIdle.sourceAuthoredStationaryWait) &&
    item.review.protectedPreviewAdmitted === false &&
    item.review.publicReleased === false && item.review.browserWebGL === 'unverified'));
});
