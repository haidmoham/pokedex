import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
const report = JSON.parse(await readFile(new URL('../content/models/admission-report.json', import.meta.url)));
test('broad admission retains source-term evidence and real decoder budgets without asserting visual review', () => {
  assert.ok(manifest.length > 500);
  assert.equal(new Set(manifest.map(asset => asset.id)).size,manifest.length);
  assert.ok(!manifest.some(asset => [855,1000].includes(asset.id)));
  for (const asset of manifest.filter(asset => asset.id !== 150)) {
    const evidence = report.results.find(result => result.id === asset.id);
    assert.equal(evidence.admitted,true);
    assert.equal(evidence.textureDecoded,true);
    assert.equal(evidence.geometryDecoded,true);
    assert.equal(evidence.visualReviewed,false);
    assert.equal(evidence.assetUseTerms.underlyingRights,'unknown');
    assert.ok(asset.bytes <= 750000);
  }
});
test('every published optimized model has byte identity, geometry preservation and attribution', async () => {
  for (const asset of manifest.filter(asset => asset.url.startsWith('/'))) {
    const bytes = await readFile(new URL(`../public${asset.url}`,import.meta.url));
    assert.equal(bytes.length,asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    assert.ok(asset.credit && asset.license && asset.source);
    if(asset.id !== 150) assert.equal(report.results.find(result => result.id === asset.id).geometryPreserved,true);
  }
});
