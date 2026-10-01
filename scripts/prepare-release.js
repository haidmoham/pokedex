import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isProtectedModelPreview } from './preview-model-context.js';
import { isPublicModelRelease, PUBLIC_MODEL_RELEASE, PUBLIC_MODEL_MANIFEST_SHA256 } from './public-model-release.js';
const publicRelease = isPublicModelRelease() && !isProtectedModelPreview();
const models = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
const previewAssets = (isProtectedModelPreview() || publicRelease) ? JSON.parse(await readFile(new URL('../.generated/preview-models.json', import.meta.url))) : [];
// A reviewed preview idle may replace one normal static model for the same species.
const effectiveModels = [...new Map([...models, ...previewAssets].map(asset => [asset.id, asset])).values()].filter(asset => asset.admitted);
const previewReplacementModels = previewAssets.filter(asset => models.some(normal => normal.id === asset.id && normal.admitted)).length;
if (publicRelease && (effectiveModels.length !== 998 || effectiveModels.filter(asset => asset.animation).length !== 547 || previewAssets.length !== 511)) throw Error('Public release count mismatch');
let sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'local'; } }
await writeFile(new URL('../public/release.json', import.meta.url),JSON.stringify({ sha, admittedModels: effectiveModels.length, nativeIdleModels: effectiveModels.filter(asset => asset.animation).length, staticModels: effectiveModels.filter(asset => !asset.animation).length, productionAdmittedModels: publicRelease ? effectiveModels.length : models.filter(asset => asset.admitted).length, previewOnlyModels: publicRelease ? 0 : previewAssets.length, publicReleasedModels: publicRelease ? previewAssets.length : 0, publicModelRelease: publicRelease ? PUBLIC_MODEL_RELEASE : null, reviewedManifestSha256: publicRelease ? PUBLIC_MODEL_MANIFEST_SHA256 : null, previewReplacementModels, protectedResearchPreview: isProtectedModelPreview(), species:1025 }) + '\n');
await writeFile(new URL('../public/models/attribution.json',import.meta.url),JSON.stringify({
  publicRelease: publicRelease ? { id: PUBLIC_MODEL_RELEASE, reviewedSource: '9651ef6a01097eef84205e368b0b388831041a0c', manifestSha256: PUBLIC_MODEL_MANIFEST_SHA256, notice: 'Owner-authorized public release. Extracted Pokemon asset redistribution rights remain unresolved; publication does not establish rights clearance. Source code MIT licenses do not cover models or textures.' } : null,
  previewException: !publicRelease && previewAssets.length ? 'Protected research preview only. Extracted Pokemon asset redistribution rights are unresolved; these entries are excluded from production admission. Source code MIT licenses do not cover models or textures.' : null,
  previewAssets,
  notice:'Uploader asset-use claims are retained; underlying Pokémon character rights remain unknown. Visual review does not establish rights clearance.',
  modifications:'Optimized derivatives retain at most one recognized idle. Existing derivatives use textures up to 512px. Batch 1 derivatives use reviewed mesh simplification, quantization and 256px WebP textures; some auxiliary PBR maps are removed. Mewtwo uses its separately documented mobile experiment.',
  assets:models.filter(asset=>asset.url.startsWith('/')).map(({id,url,credit,license,source,sha256})=>({id,url,credit,license,source,sha256, modifications:url.endsWith('-batch1.glb') ? 'Reviewed lossy derivative; mesh simplification and quantization, 256px textures. Pheromosa is rotated to face forward. See coverage-batch-lossy-2026-10-01.json for exact per-asset metrics.' : 'Existing optimized derivative; see project model pipeline reports.'}))
},null,2)+'\n');
