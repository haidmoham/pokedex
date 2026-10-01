import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { PUBLIC_MODEL_RELEASE, isPublicModelRelease, verifyPublicModelManifest, publicModelAsset } from '../scripts/public-model-release.js';
test('public release requires the exact explicit release flag', () => {
  assert.equal(isPublicModelRelease({}), false);
  assert.equal(isPublicModelRelease({ POKEDEX_MODEL_RELEASE: 'latest' }), false);
  assert.equal(isPublicModelRelease({ POKEDEX_MODEL_RELEASE: PUBLIC_MODEL_RELEASE }), true);
});
test('public release pins all reviewed model identities and keeps future batches out', async () => {
  const bytes = await readFile(new URL('../content/models/protected-preview.json', import.meta.url));
  verifyPublicModelManifest(bytes);
  assert.throws(() => verifyPublicModelManifest(Buffer.concat([bytes, Buffer.from(' ')])), /differs/);
  const original = JSON.parse(bytes).assets;
  const assets = original.map(publicModelAsset);
  assert.equal(assets.length, 511);
  assert.ok(assets.every(asset => !asset.previewOnly && asset.publicRelease === PUBLIC_MODEL_RELEASE && asset.rightsStatus === 'unresolved'));
  const normal = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
  const effective = [...new Map([...normal, ...assets].map(asset => [asset.id, asset])).values()].filter(asset => asset.admitted);
  assert.equal(effective.length, 998);
  assert.equal(effective.filter(asset => asset.animation).length, 547);
  for (let i = 0; i < assets.length; i++) {
    assert.equal(assets[i].sha256, original[i].sha256);
    assert.equal(assets[i].credit, original[i].credit);
    assert.equal(assets[i].source, original[i].source);
  }
});

test('public runtime selects the same 998 species including reviewed Gholdengo and Yveltal', async () => {
  const normal = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
  const assets = JSON.parse(await readFile(new URL('../content/models/protected-preview.json', import.meta.url))).assets.map(publicModelAsset);
  const source = (await readFile(new URL('../src/model-policy.ts', import.meta.url), 'utf8'))
    .replace("import admission from '../content/models/admitted.json';", `const admission = ${JSON.stringify(normal)};`)
    .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '')
    .replace('declare const __POKEDEX_PREVIEW_ASSETS__: ModelAsset[];', `const __POKEDEX_PREVIEW_ASSETS__: ModelAsset[] = ${JSON.stringify(assets)};`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { admittedModel, modelPreviewEnabled, modelPublicReleaseEnabled } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const selected = Array.from({length: 1025}, (_, i) => admittedModel(i + 1)).filter(Boolean);
  assert.equal(selected.length, 998);
  assert.equal(selected.filter(asset => asset.animation).length, 547);
  assert.equal(modelPreviewEnabled, false);
  assert.equal(modelPublicReleaseEnabled, true);
  assert.equal(admittedModel(1000).publicRelease, PUBLIC_MODEL_RELEASE);
  assert.equal(admittedModel(717).cameraOrbitPercent, 165);
});
