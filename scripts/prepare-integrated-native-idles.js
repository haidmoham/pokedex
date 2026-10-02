// Build the user-reviewed whole-catalog native-idle selection from pinned
// metadata. No extracted source or derivative binary is stored in Git.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIntegratedModelRelease } from './public-model-release.js';
import { trimHomeIdle } from './trim-home-idle.js';
import { compressHomeAnimation } from './compress-home-animation.js';
import { compactAnimationAccessors } from './compact-animation-accessors.js';

const generated = new URL('../.generated/', import.meta.url);
const output = new URL('../public/models/', import.meta.url);
await mkdir(generated, { recursive: true });
await mkdir(output, { recursive: true });
if (!isIntegratedModelRelease()) {
  await writeFile(new URL('integrated-models.json', generated), '[]\n');
  process.exit(0);
}
const read = async name => JSON.parse(await readFile(new URL(`../content/models/${name}.json`, import.meta.url)));
const [source, visual, cpu, originals] = await Promise.all([
  read('full-idle-candidates-2026-10-02'), read('full-review-visual-status-2026-10-02'),
  read('full-review-canvas-preflight-2026-10-02'), read('home-original-scene-review-2026-10-02'),
]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const visuals = new Map(visual.entries.map(row => [row.id, row]));
const preflight = new Map(cpu.results.map(row => [row.id, row]));
const restored = new Map(originals.rows.map(row => [row.id, row]));
const correctedSelection = new Set([990, 992, 993, 1006, 1022]);
const repairedSelection = new Set([78, 851, 894, 1008]);
if (source.candidates.length !== 478 || new Set(source.candidates.map(row => row.id)).size !== 478 ||
    visuals.size !== 478 || preflight.size !== 478 || cpu.pass !== 478 || restored.size !== 40 ||
    source.candidates.filter(row => row.currentPublicRuntime === 'absent').length !== 27 ||
    source.candidates.filter(row => row.currentPublicRuntime !== 'absent').length !== 451 ||
    source.candidates.filter(row => row.nativeIdle.sourceAuthoredStationaryWait).map(row => row.id).join(',') !== '597' ||
    visual.entries.filter(row => row.visualStatus === 'pass').length !== 431 ||
    visual.entries.filter(row => row.visualStatus === 'uncertain').length !== 12 ||
    visual.entries.filter(row => row.visualStatus === 'hold').length !== 35) {
  throw Error('Integrated native-idle review inventory changed');
}
for (const id of correctedSelection) if (!restored.has(id) || !source.candidates.some(row => row.id === id)) {
  throw Error(`Unreviewed corrected selection: ${id}`);
}
const entries = [];
for (const row of source.candidates) {
  const status = visuals.get(row.id);
  if (!status || preflight.get(row.id)?.status !== 'cpu-preflight-pass' ||
      !['pass', 'uncertain', 'hold'].includes(status.visualStatus) ||
      row.review.protectedPreviewAdmitted || row.review.publicReleased ||
      row.decodedResourceChecks.structure !== 'pass' || row.decodedResourceChecks.textures !== 'pass' ||
      row.decodedResourceChecks.geometry !== 'pass' ||
      row.nativeIdle.name !== 'HOME Idle' || row.nativeIdle.channels <= 0) {
    throw Error(`Native source is not pinned and CPU screened: ${row.id}`);
  }
  let url = row.source.url, bytes = row.source.bytes, sha256 = row.source.sha256;
  let blobSha = row.source.blobSha, selection = 'pinned-atlas-native-idle';
  if (repairedSelection.has(row.id)) {
    const path = new URL(`review-repaired-${row.id}.glb`, output);
    let repaired;
    try { repaired = await readFile(path); } catch { /* Prepare from source below. */ }
    if (!repaired || repaired.length !== row.prepared.bytes || digest(repaired) !== row.prepared.sha256) {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.body) throw Error(`Pinned native source unavailable: ${row.id}`);
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > row.source.bytes) throw Error(`Native source exceeds pin: ${row.id}`);
        chunks.push(chunk);
      }
      const original = Buffer.concat(chunks);
      if (original.length !== row.source.bytes || digest(original) !== row.source.sha256) throw Error(`Native source changed: ${row.id}`);
      repaired = await compressHomeAnimation(trimHomeIdle(original).bytes);
      if (row.id === 851) repaired = compactAnimationAccessors(repaired).bytes;
      if (repaired.length !== row.prepared.bytes || digest(repaired) !== row.prepared.sha256) throw Error(`Native transfer repair changed: ${row.id}`);
      await writeFile(path, repaired);
    }
    url = `/models/review-repaired-${row.id}.glb`;
    bytes = repaired.length; sha256 = digest(repaired); blobSha = '0'.repeat(40);
    selection = 'lossless-native-transfer-repair';
  }
  if (correctedSelection.has(row.id)) {
    const original = restored.get(row.id);
    const derivative = await readFile(new URL(`review-original-${row.id}.glb`, output));
    if (derivative.length !== original.derivative.bytes || digest(derivative) !== original.derivative.sha256 ||
        original.atlasSourceSha256 !== row.source.sha256) throw Error(`Corrected HOME scene changed: ${row.id}`);
    url = `/models/review-original-${row.id}.glb`;
    bytes = derivative.length; sha256 = digest(derivative); blobSha = '0'.repeat(40);
    selection = 'original-home-material-scene';
  }
  if (bytes <= 0 || bytes > (correctedSelection.has(row.id) ? 2_000_000 : 750_000)) throw Error(`Native transfer budget changed: ${row.id}`);
  entries.push({ id: row.id, url, bytes, sha256, blobSha, admitted: true, publicRelease: '2026-10-02-1025',
    integratedNativeIdle: true, runtime: 'home-canvas', selection,
    visualStatus: status.visualStatus, visualFinding: status.reasons.join(' '),
    sourceAuthoredStationaryWait: Boolean(row.nativeIdle.sourceAuthoredStationaryWait),
    sourceAuthoredLoopSeam: [868, 1008].includes(row.id),
    allowDisclosedLayerApproximation: correctedSelection.has(row.id) && restored.get(row.id).materialCorrectionStatus === 'held-unverified-original-layer-equation',
    sourceSha256: row.source.sha256, nativeWaitSha256: row.originalHome.nativeWait.sha256,
    animation: 'HOME Idle', credit: 'Pokémon / Nintendo / Creatures / GAME FREAK; HOME extraction by Lilothestitch16; web reconstruction by rrih',
    license: 'Extracted-asset redistribution rights unresolved; visual and capable-browser verification pending',
    source: row.source.url, rightsStatus: 'unresolved' });
}
if (entries.length !== 478 || new Set(entries.map(row => row.id)).size !== 478) throw Error('Integrated native-idle count changed');
await writeFile(new URL('integrated-models.json', generated), JSON.stringify(entries) + '\n');
console.log(`Integrated source-verified native-idle selection: ${entries.length}; 35 offline visual holds; 12 uncertain; capable-browser check pending`);
