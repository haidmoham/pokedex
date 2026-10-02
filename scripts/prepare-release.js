import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isProtectedModelPreview, isProtectedIdleExpansionPreview, isProtectedFullReviewPreview, isProtectedFormPreview } from './preview-model-context.js';
import { isPublicModelRelease, isIntegratedModelRelease, PUBLIC_MODEL_RELEASE, INTEGRATED_MODEL_RELEASE, PUBLIC_MODEL_MANIFEST_SHA256 } from './public-model-release.js';
const publicRelease = isPublicModelRelease() && !isProtectedModelPreview();
const integratedRelease = isIntegratedModelRelease();
const models = JSON.parse(await readFile(new URL('../content/models/admitted.json', import.meta.url)));
const previewAssets = (isProtectedModelPreview() || publicRelease) ? JSON.parse(await readFile(new URL('../.generated/preview-models.json', import.meta.url))) : [];
const integratedAssets = integratedRelease ? JSON.parse(await readFile(new URL('../.generated/integrated-models.json', import.meta.url))) : [];
const formPreview = isProtectedFormPreview();
const formAssets = formPreview ? JSON.parse(await readFile(new URL('../content/models/alt-form-preview-2026-10-02.json', import.meta.url))).forms : [];
if (formPreview && (formAssets.length !== 120 || formAssets.filter(form => form.kind === 'mega').length !== 62 ||
    formAssets.filter(form => form.kind === 'regional').length !== 58 ||
    formAssets.some(form => form.review.publicRelease !== false || form.review.rights !== 'unresolved'))) {
  throw Error('Protected form source inventory changed');
}
const publiclyReleasedAssets = previewAssets.filter(asset => asset.publicRelease === PUBLIC_MODEL_RELEASE);
const protectedAssets = previewAssets.filter(asset => asset.previewOnly);
// A reviewed preview idle may replace one normal static model for the same species.
const effectiveModels = [...new Map([...models, ...previewAssets, ...integratedAssets].map(asset => [asset.id, asset])).values()].filter(asset => asset.admitted);
const previewReplacementModels = previewAssets.filter(asset => models.some(normal => normal.id === asset.id && normal.admitted)).length;
if (publicRelease && !integratedRelease && (effectiveModels.length !== 998 || effectiveModels.filter(asset => asset.animation).length !== 547 || previewAssets.length !== 511)) throw Error('Public release count mismatch');
if (integratedRelease && (effectiveModels.length !== 1025 || effectiveModels.filter(asset => asset.animation).length !== 1025 ||
    previewAssets.length !== 511 || integratedAssets.length !== 478 ||
    integratedAssets.filter(asset => asset.visualStatus === 'hold').length !== 35 ||
    integratedAssets.filter(asset => asset.visualStatus === 'uncertain').length !== 12 ||
    integratedAssets.filter(asset => asset.sourceAuthoredStationaryWait).map(asset => asset.id).join(',') !== '597')) throw Error('Integrated release count or status mismatch');
if (isProtectedIdleExpansionPreview() && (effectiveModels.length !== 998 || effectiveModels.filter(asset => asset.animation).length !== 550 || publiclyReleasedAssets.length !== 511 || protectedAssets.length !== 3)) throw Error('Idle expansion preview count mismatch');
if (isProtectedFullReviewPreview() && !integratedRelease && (effectiveModels.length !== 998 || effectiveModels.filter(asset => asset.animation).length !== 547 || publiclyReleasedAssets.length !== 511 || protectedAssets.length !== 0)) throw Error('Full review changed trusted release inventory');
let sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA;
if (!sha) { try { sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch { sha = 'local'; } }
await writeFile(new URL('../public/release.json', import.meta.url),JSON.stringify({ sha, admittedModels: effectiveModels.length, nativeIdleModels: effectiveModels.filter(asset => asset.animation).length, staticModels: effectiveModels.filter(asset => !asset.animation).length, productionAdmittedModels: effectiveModels.length, previewOnlyModels: protectedAssets.length, publicReleasedModels: integratedRelease ? effectiveModels.length : publiclyReleasedAssets.length, publicModelRelease: publiclyReleasedAssets.length ? PUBLIC_MODEL_RELEASE : null, integratedModelRelease: integratedRelease ? INTEGRATED_MODEL_RELEASE : null, reviewedManifestSha256: publiclyReleasedAssets.length ? PUBLIC_MODEL_MANIFEST_SHA256 : null, previewReplacementModels, protectedResearchPreview: isProtectedModelPreview(), protectedFormPreview: formPreview, alternateFormCandidates: formAssets.length, wholeCatalogReviewCandidates: isProtectedFullReviewPreview() ? 478 : 0, integratedNativeIdleCandidates: integratedAssets.length, offlineVisualHolds: integratedAssets.filter(asset => asset.visualStatus === 'hold').length, offlineVisualUncertain: integratedAssets.filter(asset => asset.visualStatus === 'uncertain').length, stationarySourceWaitIds: integratedAssets.filter(asset => asset.sourceAuthoredStationaryWait).map(asset => asset.id), sourceAuthoredLoopSeamIds: integratedAssets.filter(asset => asset.sourceAuthoredLoopSeam).map(asset => asset.id), capableBrowserVerification: integratedRelease ? 'pending-user-check' : null, newlyVerifiedWorkingModels: 0, species:1025 }) + '\n');
await writeFile(new URL('../public/models/attribution.json',import.meta.url),JSON.stringify({
  publicRelease: publiclyReleasedAssets.length ? { id: PUBLIC_MODEL_RELEASE, reviewedSource: '9651ef6a01097eef84205e368b0b388831041a0c', manifestSha256: PUBLIC_MODEL_MANIFEST_SHA256, notice: 'Owner-authorized public release. Extracted Pokemon asset redistribution rights remain unresolved; publication does not establish rights clearance. Source code MIT licenses do not cover models or textures.' } : null,
  previewException: protectedAssets.length ? 'Protected research preview only. New extracted Pokemon asset redistribution rights are unresolved; these entries are excluded from production admission. Source code MIT licenses do not cover models or textures.' : null,
  integratedRelease: integratedRelease ? { id: INTEGRATED_MODEL_RELEASE, historicalReleaseManifestSha256: PUBLIC_MODEL_MANIFEST_SHA256, integratedNativeIdleCandidates: 478, nativeSourceFamilies: 1025, visualReview: '431 baseline pass, 12 uncertain, 35 hold among 478 new native-idle selections; capable-browser WebGL and device review pending', rights: 'Extracted-asset redistribution rights unresolved; neither source repository software license clears Pokémon model or texture rights' } : null,
  previewAssets,
  integratedAssets,
  formPreviewAssets: formAssets.map(form => ({ id: form.id, speciesId: form.speciesId, name: form.name, kind: form.kind,
    model: form.model, provenance: form.provenance, rightsStatus: form.review.rights,
    visualStatus: form.review.appearance, gpuStatus: form.review.browserGpu,
    activation: form.kind === 'mega' ? 'Authored referential Mega Stone pulse using the official Pokémon emblem; the source animation is the form idle/wait' : null })),
  notice:'Uploader asset-use claims are retained; underlying Pokémon character rights remain unknown. Visual review does not establish rights clearance.',
  modifications:'Optimized derivatives retain at most one recognized idle. Existing derivatives use textures up to 512px. Batch 1 derivatives use reviewed mesh simplification, quantization and 256px WebP textures; some auxiliary PBR maps are removed. Mewtwo uses its separately documented mobile experiment.',
  assets:models.filter(asset=>asset.url.startsWith('/')).map(({id,url,credit,license,source,sha256})=>({id,url,credit,license,source,sha256, modifications:url.endsWith('-batch1.glb') ? 'Reviewed lossy derivative; mesh simplification and quantization, 256px textures. Pheromosa is rotated to face forward. See coverage-batch-lossy-2026-10-01.json for exact per-asset metrics.' : 'Existing optimized derivative; see project model pipeline reports.'}))
},null,2)+'\n');
