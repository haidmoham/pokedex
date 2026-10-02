import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
// Keep this condition aligned with scripts/preview-model-context.js.
const fullReviewPreview = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'codex/pokedex-full-coverage-20261002' && process.env.VERCEL_BRANCH_URL === 'pokedex-review-git-codex-pokedex-full-coverage-20261002-zarnab.vercel.app';
const protectedModelPreview = (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'codex/model-idle-expansion' && process.env.VERCEL_BRANCH_URL === 'pokedex-review-git-codex-model-idle-expansion-zarnab.vercel.app') || fullReviewPreview;
const publicModelRelease = process.env.POKEDEX_MODEL_RELEASE === '2026-10-01-998' && !protectedModelPreview;
const previewAssets = (protectedModelPreview || publicModelRelease) ? JSON.parse(readFileSync(new URL('./.generated/preview-models.json', import.meta.url), 'utf8')).map((asset: Record<string, unknown>) => Object.fromEntries(['id', 'bytes', 'url', 'blobSha', 'sha256', 'credit', 'license', 'source', 'provider', 'animation', 'admitted', 'previewOnly', 'publicRelease', 'preparation', 'textureRepair', 'cameraOrbitPercent'].map(key => [key, asset[key]]))) : [];

export default defineConfig({
  plugins: [react()],
  define: { __POKEDEX_PREVIEW_ASSETS__: JSON.stringify(previewAssets) },
  build: fullReviewPreview ? { rollupOptions: { input: { main: new URL('./index.html', import.meta.url).pathname, review: new URL('./review.html', import.meta.url).pathname } } } : undefined,
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
