import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
// Keep this condition aligned with scripts/preview-model-context.js.
const protectedModelPreview = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'codex/model-idle-expansion' && process.env.VERCEL_BRANCH_URL === 'pokedex-review-git-codex-model-idle-expansion-zarnab.vercel.app';
const previewAssets = protectedModelPreview ? JSON.parse(readFileSync(new URL('./.generated/preview-models.json', import.meta.url), 'utf8')).map((asset: Record<string, unknown>) => Object.fromEntries(['id', 'bytes', 'url', 'blobSha', 'sha256', 'credit', 'license', 'source', 'provider', 'animation', 'admitted', 'previewOnly', 'preparation'].map(key => [key, asset[key]]))) : [];

export default defineConfig({
  plugins: [react()],
  define: { __POKEDEX_PREVIEW_ASSETS__: JSON.stringify(previewAssets) },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
