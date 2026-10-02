// Assemble the complete 478-species native-idle gap as a review queue, never
// as admission. Technical source/resource gates and visual/GPU gates remain
// explicit, independent fields.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { trimHomeIdle } from './trim-home-idle.js';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(`content/models/${name}`, root), 'utf8'));
const source = await read('atlas-source-catalog-2026-10-02.json');
const runtime = await read('atlas-runtime-audit-2026-10-02.json');
const repairs = await read('atlas-transfer-repair-2026-10-02.json');
const uv = await read('home-uv-repair-index-2026-10-02.json');
const ordinary = (await read('admitted.json')).filter(asset => asset.admitted);
const publicBase = (await read('protected-preview.json')).assets;
const publicEffective = new Map([...ordinary, ...publicBase].map(asset => [asset.id, asset]));
const repaired = new Map(repairs.results.map(item => [item.id, item]));
const uvIDs = new Set(uv.rows.filter(item => item.liveMaterialNames.length).map(item => item.id));
const rows = [];
for (const entry of source.records) {
  const { id } = entry, current = publicEffective.get(id);
  if (current?.animation) continue;
  const diagnostic = runtime.results[id - 1];
  if (diagnostic.id !== id || diagnostic.sourceSha256 !== entry.atlas.sha256 || diagnostic.decodedFailure ||
      diagnostic.textureFailure || diagnostic.existingStructure !== 'pass') {
    throw Error(`Unverified decoded native source: ${id}`);
  }
  const sourceAuthoredStationaryWait = id === 597 && diagnostic.movingSamplers === 0 &&
    entry.originalHome.nativeWait.path.endsWith('/pm0597_00_00_ba10_waitA01.anim') &&
    entry.originalHome.nativeWait.blobSha === '6caec673c01852fd3c6b5097271e83683b53f992';
  if (diagnostic.movingSamplers <= 0 && !sourceAuthoredStationaryWait) throw Error(`Unexplained stationary native source: ${id}`);
  const transfer = diagnostic.transferBudgetPass ? entry.sourceOnlyTrim : repaired.get(id)?.prepared;
  if (!transfer || transfer.bytes > 750000 || !/^[0-9a-f]{64}$/.test(transfer.sha256)) {
    throw Error(`Unresolved native transfer budget: ${id}`);
  }
  let additive = 'none', normalized = null;
  if (entry.customRuntimeFlags.blendMaterials.length) {
    try {
      const bytes = await readFile(new URL(`data/atlas-git/${entry.atlas.path}`, root));
      const result = trimHomeIdle(bytes, { normalizeZeroAdditive: true });
      additive = 'zero-additive-placeholder-candidate';
      normalized = { bytes: result.bytes.length, sha256: createHash('sha256').update(result.bytes).digest('hex'),
        normalizedMaterials: result.normalizedMaterials };
    } catch { additive = 'custom-additive-renderer-required'; }
  }
  const features = { stencil: Boolean(entry.customRuntimeFlags.stencilMaterials.length),
    visibility: Boolean(entry.customRuntimeFlags.visibilityNodes.length), additive,
    rawGeometryUVReview: uvIDs.has(id) };
  rows.push({
    id, currentPublicRuntime: current ? 'static' : 'absent', replacesSha256: current?.sha256 ?? null,
    source: entry.atlas, originalHome: entry.originalHome,
    nativeIdle: { ...entry.gltf.animations[0], sourceAuthoredStationaryWait },
    prepared: { bytes: transfer.bytes, sha256: transfer.sha256,
      method: diagnostic.transferBudgetPass ? 'native-guard-frame-trim' : repaired.get(id).prepared.method },
    normalizedZeroAdditiveCandidate: normalized,
    decodedResourceChecks: { structure: 'pass', textures: 'pass', geometry: 'pass', movingNativeIdle: diagnostic.movingSamplers > 0 },
    features,
    review: { cpuAppearance: 'pending', poseAwareCamera: 'pending', browserWebGL: 'unverified',
      rights: 'unresolved', protectedPreviewAdmitted: false, publicReleased: false },
  });
}
if (rows.length !== 478 || rows.filter(item => item.currentPublicRuntime === 'static').length !== 451 ||
    rows.filter(item => item.currentPublicRuntime === 'absent').length !== 27) throw Error('Full idle gap denominator changed');
const counts = { totalSpecies: 1025, currentPublicNativeIdle: 547, nativeIdleCandidates: rows.length,
  staticReplacements: 451, missingSpeciesAdditions: 27, sourceAndDecodedNativeClipVerified: rows.length,
  visibleMovingNativeIdle: rows.filter(item => item.decodedResourceChecks.movingNativeIdle).length,
  sourceAuthoredStationaryNativeWait: rows.filter(item => item.nativeIdle.sourceAuthoredStationaryWait).length,
  transferUnderCapAfterKnownRepairs: rows.length,
  stencil: rows.filter(item => item.features.stencil).length,
  visibility: rows.filter(item => item.features.visibility).length,
  zeroAdditiveCandidates: rows.filter(item => item.features.additive === 'zero-additive-placeholder-candidate').length,
  customAdditive: rows.filter(item => item.features.additive === 'custom-additive-renderer-required').length,
  rawGeometryUVReview: rows.filter(item => item.features.rawGeometryUVReview).length,
  previewAdmitted: 0, newlyPublicReleased: 0 };
const output = { checkedAt: '2026-10-02', scope: 'Complete 478 native-idle gap candidate queue, not an admission or public-release manifest',
  rightsStatus: 'unresolved', counts, candidates: rows };
await writeFile(new URL('content/models/full-idle-candidates-2026-10-02.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(counts, null, 2));
