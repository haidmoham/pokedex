// This catalog is available only from the exact SSO-protected review branch.
// It never changes the hash-pinned public model inventory or admission counts.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isProtectedFullReviewPreview } from './preview-model-context.js';
import { trimHomeIdle } from './trim-home-idle.js';
import { compressHomeAnimation } from './compress-home-animation.js';
import { compactAnimationAccessors } from './compact-animation-accessors.js';

const output = new URL('../public/models/', import.meta.url);
await mkdir(output, { recursive: true });
if (!isProtectedFullReviewPreview()) {
  // A prior local protected build must not leak a review index into production.
  const { rm } = await import('node:fs/promises');
  await rm(new URL('review-catalog.json', output), { force: true });
  for (const id of [78, 851, 894, 1008]) await rm(new URL(`review-repaired-${id}.glb`, output), { force: true });
  process.exit(0);
}
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const source = await read('content/models/full-idle-candidates-2026-10-02.json');
const visual = await read('content/models/full-review-visual-status-2026-10-02.json');
const preflight = await read('content/models/full-review-canvas-preflight-2026-10-02.json');
const restored = await read('content/models/home-original-scene-review-2026-10-02.json');
const species = await read('content/species.json');
const statuses = new Map(visual.entries.map(item => [item.id, item]));
const cpu = new Map(preflight.results.map(item => [item.id, item]));
const restoredById = new Map(restored.rows.map(item => [item.id, item]));
if (source.candidates.length !== 478 || statuses.size !== 478 || cpu.size !== 478 || preflight.pass !== 478 ||
    restored.rows.length !== 40 || restoredById.size !== 40 || species.length !== 1025) throw Error('Full review coverage changed');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const item of restored.rows) {
  const derivative = await readFile(new URL(`review-original-${item.id}.glb`, output));
  if (derivative.length !== item.derivative.bytes || digest(derivative) !== item.derivative.sha256) {
    throw Error(`Prepared original HOME review identity changed: ${item.id}`);
  }
}
const correctionFor = item => item ? {
  status: item.materialCorrectionStatus,
  url: `/models/review-original-${item.id}.glb`,
  derivativeSha256: item.derivative.sha256,
  derivativeBytes: item.derivative.bytes,
  hosted: true,
  renderEquation: 'Atlas alpha-over visual-review approximation; source shader equivalence unverified',
  layerApproximationRequired: item.materialCorrectionStatus === 'held-unverified-original-layer-equation',
  transferPolicy: item.derivative.transferPolicy,
  heldMaterials: item.heldMaterials.map(material => material.name),
  specialAtlasCompatibilityMaterials: item.specialAtlasCompatibilityMaterials,
} : null;
const exceptions = new Set([78, 851, 894, 1008]);
const candidates = [];
for (const item of source.candidates) {
  const status = statuses.get(item.id);
  if (!status || cpu.get(item.id)?.status !== 'cpu-preflight-pass' || !['pass', 'uncertain', 'hold'].includes(status.visualStatus) ||
      item.review.protectedPreviewAdmitted || item.review.publicReleased || item.source.bytes <= 0) throw Error('Unreviewed source status');
  let url = item.source.url, bytes = item.source.bytes, sha256 = item.source.sha256;
  if (exceptions.has(item.id)) {
    // Reproduce the four size repairs from the exact pinned source on every build.
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw Error(`Pinned source unavailable: ${item.id}`);
    const original = Buffer.from(await response.arrayBuffer());
    if (original.length !== bytes || digest(original) !== sha256) throw Error(`Pinned source changed: ${item.id}`);
    let repaired = await compressHomeAnimation(trimHomeIdle(original).bytes);
    if (item.id === 851) repaired = compactAnimationAccessors(repaired).bytes;
    if (repaired.length !== item.prepared.bytes || digest(repaired) !== item.prepared.sha256) throw Error(`Transfer repair changed: ${item.id}`);
    url = `/models/review-repaired-${item.id}.glb`;
    bytes = repaired.length; sha256 = digest(repaired);
    await writeFile(new URL(`review-repaired-${item.id}.glb`, output), repaired);
  } else if (bytes > 750000) throw Error(`Unrepaired transfer exception: ${item.id}`);
  candidates.push({ id: item.id, name: species[item.id - 1].name,
    publicRuntime: item.currentPublicRuntime, reviewStatus: status.visualStatus === 'hold' ? 'broken-in-baseline' : 'needs-review',
    baselineVisualStatus: status.visualStatus, finding: status.reasons.join(' '),
    cpuRendererPreflight: 'pass', browserGpuPlayback: 'unverified',
    correctedSourceReview: correctionFor(restoredById.get(item.id)),
    url, bytes, sha256, sourceUrl: item.source.url, sourceSha256: item.source.sha256,
    animation: item.nativeIdle.name, nativeDuration: item.nativeIdle.nativeDuration,
    sourceAuthoredStationaryWait: item.nativeIdle.sourceAuthoredStationaryWait,
    features: item.features, originalHome: item.originalHome,
    reviewOnly: true, previewOnly: true, admitted: false, rightsStatus: 'unresolved',
    credit: 'Pokémon / Nintendo / Creatures / GAME FREAK; HOME extraction by Lilothestitch16; web reconstruction by rrih',
    license: 'Redistribution rights unresolved; protected research preview only',
    officialArt: `https://raw.githubusercontent.com/PokeAPI/sprites/bfb75391935310368065096fa08c51e8970bc43e/sprites/pokemon/other/official-artwork/${item.id}.png` });
}
if (candidates.length !== 478 || new Set(candidates.map(item => item.id)).size !== 478) throw Error('Duplicate full review candidate');
const native = new Set(candidates.map(item => item.id));
const all = species.map(item => ({ id: item.id, name: item.name,
  reviewStatus: native.has(item.id) ? 'candidate' : 'existing-public-inventory',
  correctedSourceReview: correctionFor(restoredById.get(item.id)) }));
const counts = { totalSpecies: 1025, currentPublicModels: 998, currentPublicNativeIdles: 547,
  newVerifiedWorking: 0, reviewCandidates: 478, cpuRendererPreflightPass: 478,
  baselinePass: candidates.filter(item => item.baselineVisualStatus === 'pass').length,
  baselineUncertain: candidates.filter(item => item.baselineVisualStatus === 'uncertain').length,
  baselineHold: candidates.filter(item => item.baselineVisualStatus === 'hold').length,
  sourceAuthoredStationaryWait: candidates.filter(item => item.sourceAuthoredStationaryWait).length,
  reconstructedOriginalSceneReview: restored.rows.length, unverifiedLayerEquationHolds: restored.counts.sourceLayerEquationHolds,
  exactTwoMegabyteReviewTransferExceptions: restored.counts.exactPreviewTransferExceptions };
const catalog = { scope: 'SSO-protected, review-only whole-species inventory; source/CPU checks are not GPU or release admission',
  rightsStatus: 'unresolved', sourceRevision: 'ef25889c60f099aa864bed11042f4054827a78c4',
  publicManifestSha256: '69264fdafa834db8dc0d946901971ac01b0f1a3ae1f7dc820f7bbc5c1076e4a4',
  counts, species: all, candidates };
await writeFile(new URL('review-catalog.json', output), JSON.stringify(catalog) + '\n');
console.log(`Protected whole-catalog review: ${all.length} species, ${candidates.length} candidates, ${counts.baselineHold} CPU-baseline holds`);
