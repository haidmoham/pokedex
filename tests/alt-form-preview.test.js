import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { isProtectedFormPreview, ALT_FORM_REF, VERIFIED_ALT_FORM_BRANCH_URL } from '../scripts/preview-model-context.js';
import { isPublicFormRelease, FORM_RELEASE } from '../scripts/form-release.js';

const catalog = JSON.parse(await readFile(new URL('../content/models/alt-form-preview-2026-10-02.json', import.meta.url)));
globalThis.__POKEDEX_FORM_ASSETS__ = catalog.forms;
const compile = async (name, suffix = '') => {
  let source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  if (name === 'model-policy') source = source.replace("import admission from '../content/models/admitted.json';", 'const admission = [];')
    .replace("import { officialEdition, Pokemon, CardEdition } from './feed-model';", '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}${suffix}`);
};
const { formModelAsset, formsForSpecies } = await compile('form-policy');
const { modelTransferLimit } = await compile('model-policy');

test('protected form inventory has exact named source, native motion and rights evidence', () => {
  assert.deepEqual(catalog.counts, { candidateForms: 120, mega: 62, regional: 58, species: 111,
    homeSource: 106, externalSource: 14, transferExceptions: 3, sourceUnavailableMega: 35 });
  assert.equal(new Set(catalog.forms.map(form => form.id)).size, 120);
  assert.equal(formsForSpecies(6).map(form => form.id).join(','), 'charizard-mega-x,charizard-mega-y');
  for (const form of catalog.forms) {
    assert.ok(formModelAsset(form), form.id);
    assert.ok(form.model.channels > 0 && form.model.movingSamplers > 0 && form.model.duration > 0);
    assert.deepEqual(form.review, { sourceIdentity: 'verified', decodedResources: 'cpu-pass',
      nativeAnimation: 'source-authored', appearance: 'unreviewed', browserGpu: 'unverified',
      rights: 'unresolved', publicRelease: true });
    assert.equal(form.model.transferException, form.model.bytes > 750_000);
  }
  assert.equal(catalog.unavailableMegaForms.length, 35);
});

test('form review transfer exceptions are bound to exact published file identity', () => {
  const exceptions = catalog.forms.filter(form => form.model.transferException);
  assert.deepEqual(exceptions.map(form => form.id), ['ninetales-alola', 'darkrai-mega', 'zoroark-hisui']);
  for (const form of exceptions) {
    const asset = formModelAsset(form);
    assert.equal(modelTransferLimit(asset), 2_000_000);
    assert.equal(modelTransferLimit({ ...asset, sha256: '0'.repeat(64) }), 750_000);
    assert.equal(modelTransferLimit({ ...asset, url: 'https://elsewhere.example/form.glb' }), 750_000);
    assert.equal(modelTransferLimit({ ...asset, previewOnly: false }), 750_000);
  }
  assert.equal(formModelAsset({ ...exceptions[0], id: '../changed' }), undefined);
});

test('approved public forms retain native clips and exact transfer exceptions', async () => {
  globalThis.__POKEDEX_FORM_PUBLIC_RELEASE__ = true;
  const { formModelAsset: publicFormAsset } = await compile('form-policy', '#public');
  for (const form of catalog.forms) {
    const asset = publicFormAsset(form);
    assert.equal(asset.admitted, true);
    assert.equal(asset.previewOnly, false);
    assert.equal(asset.publicRelease, '2026-10-02-120');
    assert.equal(asset.animation, form.model.animation);
    assert.equal(modelTransferLimit(asset), form.model.transferException ? 2_000_000 : 750_000);
  }
});

test('only the exact form release or protected alias can include forms', () => {
  assert.equal(isProtectedFormPreview({ VERCEL_ENV: 'production', POKEDEX_FORM_PREVIEW: '2026-10-02-forms' }), false);
  assert.equal(isProtectedFormPreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'other', VERCEL_BRANCH_URL: VERIFIED_ALT_FORM_BRANCH_URL }), false);
  assert.equal(isProtectedFormPreview({ POKEDEX_FORM_PREVIEW: '2026-10-02-forms' }), true);
  assert.equal(isProtectedFormPreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ALT_FORM_REF, VERCEL_BRANCH_URL: VERIFIED_ALT_FORM_BRANCH_URL }), true);
  assert.equal(isPublicFormRelease({}), false);
  assert.equal(isPublicFormRelease({ POKEDEX_FORM_RELEASE: FORM_RELEASE }), false);
  assert.equal(isPublicFormRelease({ POKEDEX_FORM_RELEASE: FORM_RELEASE, POKEDEX_MODEL_RELEASE: '2026-10-02-1025', VERCEL_ENV: 'preview' }), false);
  assert.equal(isPublicFormRelease({ POKEDEX_FORM_RELEASE: FORM_RELEASE, POKEDEX_MODEL_RELEASE: '2026-10-02-1025', VERCEL_ENV: 'production' }), true);
});
