import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isProtectedModelPreview, isProtectedIdleExpansionPreview } from './preview-model-context.js';
import { isPublicModelRelease, PUBLIC_MODEL_RELEASE, PUBLIC_MODEL_MANIFEST_SHA256 } from './public-model-release.js';
const publicRelease = isPublicModelRelease() && !isProtectedModelPreview();
const models = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
const previewAssets = (isProtectedModelPreview() || publicRelease) ? JSON.parse(await readFile(new URL('../.generated/preview-models.json', import.meta.url))) : [];
const publiclyReleasedAssets = previewAssets.filter(asset => asset.publicRelease === PUBLIC_MODEL_RELEASE);
const protectedAssets = previewAssets.filter(asset => asset.previewOnly);
// A reviewed preview idle may replace one normal static model for the same species.
const effectiveModels = [...new Map([...models, ...previewAssets].map(asset => [asset.id, asset])).values()].filter(asset => asset.admitted);
const previewReplacementModels = previewAssets.filter(asset => models.some(normal => normal.id === asset.id && normal.admitted)).length;
if (publicRelease && (effectiveModels.length !== 998 || effectiveModels.filter(asset => asset.animation).length !== 547 || previewAssets.length !== 511)) throw Error('Public release count mismatch');
if (isProtectedIdleExpansionPreview() && (effectiveModels.length !== 998 || effectiveModels.filter(asset => asset.animation).length !== 550 || publiclyReleasedAssets.length !== 511 || protectedAssets.length !== 3)) throw Error('Idle expansion preview count mismatch');
let sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'local'; } }
await writeFile(new URL('../public/release.json', import.meta.url),JSON.stringify({ sha, admittedModels: effectiveModels.length, nativeIdleModels: effectiveModels.filter(asset => asset.animation).length, staticModels: effectiveModels.filter(asset => !asset.animation).length, productionAdmittedModels: [...new Map([...models, ...publiclyReleasedAssets].map(asset => [asset.id, asset]))].filter(([, asset]) => asset.admitted).length, previewOnlyModels: protectedAssets.length, publicReleasedModels: publiclyReleasedAssets.length, publicModelRelease: publiclyReleasedAssets.length ? PUBLIC_MODEL_RELEASE : null, reviewedManifestSha256: publiclyReleasedAssets.length ? PUBLIC_MODEL_MANIFEST_SHA256 : null, previewReplacementModels, protectedResearchPreview: isProtectedModelPreview(), species:1025 }) + '\n');
await writeFile(new URL('../public/models/attribution.json',import.meta.url),JSON.stringify({
  publicRelease: publiclyReleasedAssets.length ? { id: PUBLIC_MODEL_RELEASE, reviewedSource: '9651ef6a01097eef84205e368b0b388831041a0c', manifestSha256: PUBLIC_MODEL_MANIFEST_SHA256, notice: 'Owner-authorized public release. Extracted Pokemon asset redistribution rights remain unresolved; publication does not establish rights clearance. Source code MIT licenses do not cover models or textures.' } : null,
  previewException: protectedAssets.length ? 'Protected research preview only. New extracted Pokemon asset redistribution rights are unresolved; these entries are excluded from production admission. Source code MIT licenses do not cover models or textures.' : null,
  previewAssets,
  notice:'Uploader asset-use claims are retained; underlying Pokémon character rights remain unknown. Visual review does not establish rights clearance.',
  modifications:'Optimized derivatives retain at most one recognized idle. Existing derivatives use textures up to 512px. Batch 1 derivatives use reviewed mesh simplification, quantization and 256px WebP textures; some auxiliary PBR maps are removed. Mewtwo uses its separately documented mobile experiment.',
  assets:models.filter(asset=>asset.url.startsWith('/')).map(({id,url,credit,license,source,sha256})=>({id,url,credit,license,source,sha256, modifications:url.endsWith('-batch1.glb') ? 'Reviewed lossy derivative; mesh simplification and quantization, 256px textures. Pheromosa is rotated to face forward. See coverage-batch-lossy-2026-10-01.json for exact per-asset metrics.' : 'Existing optimized derivative; see project model pipeline reports.'}))
},null,2)+'\n');
