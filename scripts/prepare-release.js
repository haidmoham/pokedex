import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isProtectedModelPreview } from './preview-model-context.js';
const models = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
const previewAssets = isProtectedModelPreview() ? JSON.parse(await readFile(new URL('../.generated/preview-models.json', import.meta.url))) : [];
const effectiveModels = [...models, ...previewAssets];
let sha = process.env.VERCEL_GIT_COMMIT_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'local'; } }
await writeFile(new URL('../public/release.json', import.meta.url),JSON.stringify({ sha, admittedModels: effectiveModels.filter(asset => asset.admitted).length, productionAdmittedModels: models.filter(asset => asset.admitted).length, previewOnlyModels: previewAssets.length, protectedResearchPreview: isProtectedModelPreview(), species:1025 }) + '\n');
await writeFile(new URL('../public/models/attribution.json',import.meta.url),JSON.stringify({
  previewException: previewAssets.length ? 'Protected research preview only. Extracted Pokemon asset redistribution rights are unresolved; these entries are excluded from production admission. Source code MIT licenses do not cover models or textures.' : null,
  previewAssets,
  notice:'Uploader asset-use claims are retained; underlying Pokémon character rights remain unknown. Visual review does not establish rights clearance.',
  modifications:'Optimized derivatives retain at most one recognized idle. Existing derivatives use textures up to 512px. Batch 1 derivatives use reviewed mesh simplification, quantization and 256px WebP textures; some auxiliary PBR maps are removed. Mewtwo uses its separately documented mobile experiment.',
  assets:models.filter(asset=>asset.url.startsWith('/')).map(({id,url,credit,license,source,sha256})=>({id,url,credit,license,source,sha256, modifications:url.endsWith('-batch1.glb') ? 'Reviewed lossy derivative; mesh simplification and quantization, 256px textures. Pheromosa is rotated to face forward. See coverage-batch-lossy-2026-10-01.json for exact per-asset metrics.' : 'Existing optimized derivative; see project model pipeline reports.'}))
},null,2)+'\n');
