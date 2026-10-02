// Verify the exact normal-feed build inventory after npm run build. This is a
// selection/identity check, not a capable-browser visual acceptance claim.
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIntegratedModelRelease } from './public-model-release.js';
import { isProtectedFullReviewPreview, isProtectedFormPreview } from './preview-model-context.js';
import { isPublicFormRelease, FORM_RELEASE } from './form-release.js';

if (!isIntegratedModelRelease()) throw Error('Integrated build audit requires the exact release flag');
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root)));
const [release, selected, historical, ordinary] = await Promise.all([
  read('dist/release.json'), read('.generated/integrated-models.json'),
  read('.generated/preview-models.json'), read('content/models/admitted.json'),
]);
if (release.integratedModelRelease !== '2026-10-02-1025' || release.admittedModels !== 1025 ||
    release.nativeIdleModels !== 1025 || release.staticModels !== 0 ||
    release.integratedNativeIdleCandidates !== 478 || release.offlineVisualHolds !== 35 ||
    release.offlineVisualUncertain !== 12 || release.capableBrowserVerification !== 'pending-user-check' ||
    historical.length !== 511 || selected.length !== 478) throw Error('Integrated release inventory mismatch');
const effective = new Map([...ordinary, ...historical, ...selected].filter(item => item.admitted).map(item => [item.id, item]));
if (effective.size !== 1025 || [...effective.values()].some(item => !item.animation) ||
    new Set(selected.map(item => item.id)).size !== 478 ||
    selected.filter(item => item.visualStatus === 'hold').length !== 35 ||
    selected.filter(item => item.visualStatus === 'uncertain').length !== 12 ||
    selected.filter(item => item.sourceAuthoredStationaryWait).map(item => item.id).join(',') !== '597' ||
    selected.filter(item => item.sourceAuthoredLoopSeam).map(item => item.id).join(',') !== '868,1008') {
  throw Error('Integrated species or native motion inventory changed');
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let hosted = 0, remote = 0;
for (const asset of [...historical, ...selected]) {
  if (!asset.url.startsWith('/models/')) { remote++; continue; }
  const bytes = await readFile(new URL(`dist${asset.url}`, root));
  if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw Error(`Built model identity changed: ${asset.id}`);
  hosted++;
}
if (hosted !== 520 || remote !== 469 || selected.filter(asset => asset.url.startsWith('/models/')).length !== 9) {
  throw Error('Integrated hosted/remote asset inventory changed');
}
const distFiles = await readdir(new URL('dist/', root));
const models = await readdir(new URL('dist/models/', root));
const protectedReview = isProtectedFullReviewPreview();
const formPreview = isProtectedFormPreview();
const formRelease = isPublicFormRelease();
if (formPreview && formRelease) throw Error('Form build has conflicting release targets');
const attribution = await read('dist/models/attribution.json');
const assetFiles = await readdir(new URL('dist/assets/', root));
const entry = assetFiles.filter(name => /^index-[^/]+\.js$/.test(name));
if (entry.length !== 1) throw Error('Built app entry is ambiguous');
const appCode = await readFile(new URL(`dist/assets/${entry[0]}`, root), 'utf8');
if (models.some(name => name.endsWith('.glb') && name.includes('forms'))) throw Error('Form binary entered public build');
if (formPreview || formRelease) {
  const forms = await read('content/models/alt-form-preview-2026-10-02.json');
  if (forms.forms.length !== 120 || release.protectedFormPreview !== formPreview ||
      release.publicFormRelease !== (formRelease ? FORM_RELEASE : null) ||
      release.alternateFormModels !== 120 || release.nativeFormIdles !== 120 ||
      release.alternateFormCandidates !== (formPreview ? 120 : 0) ||
      attribution.formAssets?.length !== 120 || Boolean(attribution.formRelease) !== formRelease ||
      !appCode.includes('Mega Charizard X') ||
      !appCode.includes('atlas/public/models/forms/charizard-mega-x.glb') ||
      !appCode.includes('Explore forms')) throw Error('Approved form inventory changed');
} else if (release.protectedFormPreview !== false || release.publicFormRelease !== null ||
    release.alternateFormModels !== 0 || release.nativeFormIdles !== 0 || release.alternateFormCandidates !== 0 ||
    attribution.formAssets?.length !== 0 || attribution.formRelease !== null ||
    appCode.includes('atlas/public/models/forms/charizard-mega-x.glb')) {
  throw Error('Unreviewed alternate form entered non-form build');
}
if (models.filter(name => /^review-repaired-\d+\.glb$/.test(name)).length !== 4) throw Error('Native transfer repair inventory changed');
if (protectedReview) {
  const catalog = await read('dist/models/review-catalog.json');
  if (!distFiles.includes('review.html') || catalog.species.length !== 1025 || catalog.candidates.length !== 478 ||
      models.filter(name => /^review-original-\d+\.glb$/.test(name)).length !== 40 ||
      release.protectedResearchPreview !== true || release.wholeCatalogReviewCandidates !== 478) {
    throw Error('Protected review workbench inventory changed');
  }
} else if (distFiles.includes('review.html') || models.includes('review-catalog.json') ||
    models.filter(name => /^review-original-\d+\.glb$/.test(name)).length !== 5 ||
    release.protectedResearchPreview !== false || release.wholeCatalogReviewCandidates !== 0) {
  throw Error('Protected review assets leaked into normal build');
}
for (const name of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  await access(new URL(`dist/model-runtime/draco/${name}`, root));
}
console.log(JSON.stringify({ species: effective.size, nativeIdles: 1025, newNativeSelections: selected.length,
  hostedModels: hosted, remotePinnedNewModels: remote, offlineVisualHolds: 35,
  offlineVisualUncertain: 12, stationaryNativeWaitIds: [597], authoredLoopSeamIds: [868, 1008],
  gpuVerified: false, protectedReviewWorkbench: protectedReview, protectedFormPreview: formPreview,
  publicFormRelease: formRelease ? FORM_RELEASE : null, alternateFormModels: formPreview || formRelease ? 120 : 0 }, null, 2));
