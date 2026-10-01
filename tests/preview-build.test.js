import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('preview build retains source-family attribution and excludes extracted assets outside its authorized branch', async () => {
  const configUrl = new URL('../vite.config.ts', import.meta.url);
  const source = (await readFile(configUrl, 'utf8')).replaceAll('import.meta.url', JSON.stringify(configUrl.href));
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const manifest = JSON.parse(await readFile(new URL('../content/models/protected-preview.json', import.meta.url)));
  const previewEnv = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/model-idle-expansion', VERCEL_BRANCH_URL: 'pokedex-review-git-codex-model-idle-expansion-zarnab.vercel.app' };
  const buildAssets = env => {
    const exports = {};
    const dependencies = {
      vite: { defineConfig: config => config },
      '@vitejs/plugin-react': { default: () => ({}) },
      'node:fs': { readFileSync: url => {
        assert.equal(url.pathname, new URL('../.generated/preview-models.json', import.meta.url).pathname);
        return JSON.stringify(manifest.assets);
      } },
    };
    runInNewContext(compiled, { exports, URL, process: { env }, require: id => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected config dependency: ${id}`);
      return dependencies[id];
    } });
    return JSON.parse(exports.default.define.__POKEDEX_PREVIEW_ASSETS__);
  };
  const assets = buildAssets(previewEnv);
  assert.equal(assets.length, manifest.assets.length);
  for (const id of [995, 1023]) assert.equal(assets.find(asset => asset.id === id)?.preparation, 'catalog-native-idle');
  const yveltal = assets.find(asset => asset.id === 717);
  assert.equal(yveltal?.textureRepair, 'prune-yveltal-zero-alpha');
  assert.equal(yveltal?.cameraOrbitPercent, 165);
  for (const env of [{}, { ...previewEnv, VERCEL_ENV: 'production' }, { ...previewEnv, VERCEL_GIT_COMMIT_REF: 'main' }, { ...previewEnv, VERCEL_BRANCH_URL: 'unrelated.vercel.app' }]) {
    assert.deepEqual(buildAssets(env), []);
  }
});
