// Bounded source-only screening. Never changes runtime admission or publishes GLBs.
// Decoded mesh/texture budgets, visual appearance, camera and live playback still
// require the separate reviewed pipeline before an asset enters any manifest.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { trimHomeIdle } from './trim-home-idle.js';

const queue = JSON.parse(await readFile(new URL('../content/models/native-idle-source-queue-2026-10-02.json', import.meta.url), 'utf8'));
const ids = process.argv.slice(2).map(Number);
if (!ids.length || ids.length > 3 || ids.some(id => !Number.isInteger(id))) {
  throw new Error('Provide one to three queued species IDs');
}
if (new Set(ids).size !== ids.length) throw new Error('Duplicate species ID');
const batch = ids.map(id => {
  const entry = queue.firstBatch.find(item => item.id === id);
  if (!entry || entry.status !== 'source-screened-only' || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 750000 ||
      entry.path !== `atlas/public/models/home/${id}.glb` || !/^[0-9a-f]{40}$/.test(entry.blobSha)) {
    throw new Error(`Species ${id} is not in the bounded source queue`);
  }
  return entry;
});
const destination = new URL('../data/native-idle-source-screen/', import.meta.url);
await mkdir(destination, { recursive: true });

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function parseGLB(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB header');
  const length = bytes.readUInt32LE(12), binaryHeader = 20 + length;
  if (binaryHeader + 8 > bytes.length || bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942 ||
      bytes.readUInt32LE(binaryHeader) !== bytes.length - binaryHeader - 8) throw new Error('Invalid GLB chunks');
  return JSON.parse(bytes.subarray(20, binaryHeader).toString('utf8'));
}

const results = [];
for (const entry of batch) {
  const url = `https://raw.githubusercontent.com/rrih/rrih.github.io/${queue.sourceRevision}/${entry.path}`;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw new Error(`Source HTTP ${response.status} for ${entry.id}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > entry.bytes || size > 750000) throw new Error(`Source cap exceeded for ${entry.id}`);
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks);
  if (source.length !== entry.bytes || gitBlobSha(source) !== entry.blobSha) throw new Error(`Source identity changed for ${entry.id}`);
  const gltf = parseGLB(source);
  const holdReasons = [];
  if (gltf.asset?.version !== '2.0' || (gltf.buffers ?? []).some(item => item.uri) || (gltf.images ?? []).some(item => item.uri)) {
    holdReasons.push('external dependency or unsupported glTF version');
  }
  if (gltf.animations?.length !== 1 || gltf.animations[0].name !== 'HOME Idle') holdReasons.push('missing unique native HOME Idle');
  if ((gltf.nodes ?? []).some(item => item.extras?.homeVisibility)) holdReasons.push('animated visibility requires renderer review');
  if ((gltf.materials ?? []).some(item => item.extras?.homeStencil)) holdReasons.push('stencil effects require renderer review');
  if ((gltf.materials ?? []).some(item => item.extras?.homeBlend)) holdReasons.push('custom blending requires renderer review');
  let derivative = null;
  let repairCandidate = null;
  if (!holdReasons.length) {
    try {
      derivative = trimHomeIdle(source);
      if (derivative.bytes.length > 750000) holdReasons.push('prepared transfer cap exceeded');
    } catch (error) { holdReasons.push(`native loop preparation failed: ${error.message}`); }
  }
  if (holdReasons.length) derivative = null;
  if (holdReasons.length === 1 && holdReasons[0] === 'custom blending requires renderer review') {
    try {
      const normalized = trimHomeIdle(source, { normalizeZeroAdditive: true });
      if (normalized.bytes.length <= 750000) {
        repairCandidate = { kind: 'zero-additive-placeholder', bytes: normalized.bytes.length,
          sha256: sha256(normalized.bytes), normalizedMaterials: normalized.normalizedMaterials,
          duration: normalized.duration, removedGuardKeys: normalized.removedGuardKeys,
          status: 'requires visual material review' };
        await writeFile(new URL(`${entry.id}-zero-additive-candidate.glb`, destination), normalized.bytes);
      }
    } catch { /* Nonzero custom blending remains held without a candidate. */ }
  }
  const report = {
    id: entry.id, status: holdReasons.length ? 'source-held' : 'source-screened-only', admitted: false,
    source: { url, bytes: source.length, blobSha: entry.blobSha, sha256: sha256(source) },
    derivative: derivative ? { bytes: derivative.bytes.length, sha256: sha256(derivative.bytes), animation: derivative.animation,
      duration: derivative.duration, removedGuardKeys: derivative.removedGuardKeys } : null,
    repairCandidate,
    structure: { meshes: gltf.meshes?.length ?? 0, images: gltf.images?.length ?? 0,
      textures: gltf.textures?.length ?? 0, skins: gltf.skins?.length ?? 0, requiredExtensions: gltf.extensionsRequired ?? [] },
    holdReasons,
    pending: ['decoded geometry and texture budgets', 'three-pose motion and appearance render',
      'camera clearance sweep', 'browser native-playback verification', 'protected-preview authorization gate'],
    rightsStatus: 'unresolved',
  };
  await writeFile(new URL(`${entry.id}-source.glb`, destination), source);
  if (derivative) await writeFile(new URL(`${entry.id}-trimmed.glb`, destination), derivative.bytes);
  await writeFile(new URL(`${entry.id}.json`, destination), JSON.stringify(report, null, 2) + '\n');
  results.push(report);
}
console.log(JSON.stringify(results, null, 2));
