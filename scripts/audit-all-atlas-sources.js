// Inventory every pinned Atlas normal model and its exact native idle source.
// Read-only with respect to runtime admission and model binaries. Original
// extracted assets remain in ignored local source storage, never in Git.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { trimHomeIdle } from './trim-home-idle.js';

const root = new URL('../', import.meta.url);
const sourceTree = JSON.parse(await readFile(new URL('content/models/atlas-normal-source-tree-2026-10-02.json', root), 'utf8'));
const companions = JSON.parse(await readFile(new URL('content/models/home-core-source-catalog-2026-10-02.json', root), 'utf8'));
const ordinary = JSON.parse(await readFile(new URL('content/models/admitted.json', root), 'utf8')).filter(asset => asset.admitted);
const released = JSON.parse(await readFile(new URL('content/models/protected-preview.json', root), 'utf8')).assets;
const effective = new Map([...ordinary, ...released].map(asset => [asset.id, asset]));
if (sourceTree.revision !== 'ef25889c60f099aa864bed11042f4054827a78c4' ||
    sourceTree.sourceFiles !== 1025 || companions.species !== 1025 || sourceTree.assets.length !== 1025 ||
    companions.records.length !== 1025) throw new Error('Incomplete or unexpected pinned source inventory');

function parseGLB(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB header');
  const size = bytes.readUInt32LE(12), end = 20 + size;
  if (end + 8 > bytes.length || bytes.readUInt32LE(end + 4) !== 0x004e4942 ||
      bytes.readUInt32LE(end) !== bytes.length - end - 8) throw new Error('Invalid GLB chunks');
  return JSON.parse(bytes.subarray(20, end).toString('utf8'));
}
const records = [];
for (let id = 1; id <= 1025; id++) {
  const source = sourceTree.assets[id - 1], original = companions.records[id - 1];
  if (source.id !== id || source.path !== `atlas/public/models/home/${id}.glb` || original.id !== id ||
      !original.nativeWait.path.endsWith('_ba10_waitA01.anim')) throw new Error(`Misaligned source mapping for ${id}`);
  const path = new URL(`data/atlas-git/${source.path}`, root);
  const bytes = await readFile(path);
  const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (bytes.length !== source.bytes || blobSha !== source.blobSha) throw new Error(`Git source identity changed for ${id}`);
  const gltf = parseGLB(bytes);
  const animations = (gltf.animations ?? []).map(animation => ({
    name: animation.name ?? null, nativeDuration: animation.extras?.homeDuration ?? null,
    channels: animation.channels?.length ?? 0, samplers: animation.samplers?.length ?? 0,
    latestAccessorTime: Math.max(0, ...(animation.samplers ?? []).map(sampler =>
      gltf.accessors?.[sampler.input]?.max?.[0] ?? 0)),
  }));
  const flags = {
    stencilMaterials: (gltf.materials ?? []).filter(material => material.extras?.homeStencil).map(material => material.name ?? null),
    blendMaterials: (gltf.materials ?? []).filter(material => material.extras?.homeBlend).map(material =>
      ({ name: material.name ?? null, mode: material.extras.homeBlend })),
    visibilityNodes: (gltf.nodes ?? []).filter(node => node.extras?.homeVisibility).map(node => node.name ?? null),
  };
  let trimmed = null, trimFailure = null;
  try {
    const result = trimHomeIdle(bytes);
    trimmed = { bytes: result.bytes.length, sha256: createHash('sha256').update(result.bytes).digest('hex'),
      animation: result.animation, duration: result.duration, removedGuardKeys: result.removedGuardKeys,
      transferBudgetPass: result.bytes.length <= 750000 };
  } catch (error) { trimFailure = String(error.message); }
  const current = effective.get(id);
  records.push({
    id, atlas: { url: `https://raw.githubusercontent.com/rrih/rrih.github.io/${sourceTree.revision}/${source.path}`,
      path: source.path, bytes: bytes.length, blobSha, sha256: createHash('sha256').update(bytes).digest('hex'),
      transferBudgetPass: bytes.length <= 750000 },
    originalHome: { geometry: original.geometry, nativeWait: original.nativeWait,
      materialFiles: original.materialFiles, textureFiles: original.textureFiles,
      animationFiles: original.animationFiles,
      companionSourcePointer: 'content/models/home-upstream-metadata-pointers-2026-10-02.json' },
    gltf: { version: gltf.asset?.version ?? null, requiredExtensions: gltf.extensionsRequired ?? [],
      meshes: gltf.meshes?.length ?? 0, skins: gltf.skins?.length ?? 0,
      materials: gltf.materials?.length ?? 0, images: gltf.images?.length ?? 0,
      textures: gltf.textures?.length ?? 0, animations },
    customRuntimeFlags: flags,
    sourceOnlyTrim: trimmed,
    sourceOnlyTrimFailure: trimFailure,
    currentPublicRuntime: current ? (current.animation ? 'native-idle' : 'static') : 'absent',
    rightsStatus: 'unresolved',
    visualOrRuntimeApproved: false,
  });
}
const counts = {
  sourceFilesVerified: records.length,
  nativeIdleNamed: records.filter(record => record.gltf.animations.some(animation =>
    animation.name === 'HOME Idle' && animation.nativeDuration > 0 && animation.channels > 0)).length,
  sourceOnlyTrimmed: records.filter(record => record.sourceOnlyTrim).length,
  trimmedWithinTransferBudget: records.filter(record => record.sourceOnlyTrim?.transferBudgetPass).length,
  rawWithinTransferBudget: records.filter(record => record.atlas.transferBudgetPass).length,
  stencilSpecies: records.filter(record => record.customRuntimeFlags.stencilMaterials.length).length,
  blendSpecies: records.filter(record => record.customRuntimeFlags.blendMaterials.length).length,
  visibilitySpecies: records.filter(record => record.customRuntimeFlags.visibilityNodes.length).length,
  currentPublicNativeIdle: records.filter(record => record.currentPublicRuntime === 'native-idle').length,
  currentPublicStatic: records.filter(record => record.currentPublicRuntime === 'static').length,
  currentPublicAbsent: records.filter(record => record.currentPublicRuntime === 'absent').length,
};
const result = { checkedAt: '2026-10-02', scope: 'Pinned source completeness, not runtime or redistribution admission',
  atlasRepository: sourceTree.repository, atlasRevision: sourceTree.revision, atlasTreeSha: sourceTree.treeSha,
  originalGeometryRevision: companions.geometryRevision, originalMaterialMotionRevision: companions.materialMotionRevision,
  counts, records };
await writeFile(new URL('content/models/atlas-source-catalog-2026-10-02.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(counts, null, 2));
