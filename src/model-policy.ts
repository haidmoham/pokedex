import admission from '../content/models/admitted.json';
import { officialEdition, Pokemon, CardEdition } from './feed-model';

export type ModelAsset = { id: number; bytes: number; url: string; blobSha: string; sha256?: string; admitted: boolean; credit: string; license: string; source: string; animation?: string | null; previewOnly?: boolean; provider?: string; preparation?: 'catalog-native-idle' };

export function previewModelAttribution(asset: ModelAsset) {
  const catalog = asset.preparation === 'catalog-native-idle';
  return {
    description: catalog
      ? 'Pokémon character models, textures and motion belong to Pokémon / Nintendo / Creatures / GAME FREAK. Pokemon-3D-api published this source file; its original extractor is not identified. This protected draft selects its exact native wait clip and removes unused data without changing retained geometry, textures, motion or skin bindings. Redistribution rights remain unresolved; no software license is asserted to license these assets.'
      : 'Pokémon character models, textures and motion belong to Pokémon / Nintendo / Creatures / GAME FREAK. Lilothestitch16 published the HOME extraction; rrih reconstructed its web materials and native idle. This protected draft trims the idle guard frame without changing the source geometry, texture or skeletal values. Redistribution rights remain unresolved; neither project’s software license licenses these assets.',
    links: catalog ? [
      { url: asset.source, label: 'Pinned source file ↗' },
      { url: '/models/attribution.json', label: 'Pinned hashes & modifications ↗' },
    ] : [
      { url: 'https://github.com/Lilothestitch16/Pokemon-HOME-GLB-Models', label: 'Geometry source ↗' },
      { url: 'https://github.com/Lilothestitch16/Pokemon-HOME-Unity-Models', label: 'Texture & motion source ↗' },
      { url: 'https://rrih.github.io/atlas/legal/en/rights.html', label: 'Reconstruction rights notice ↗' },
      { url: '/models/attribution.json', label: 'Pinned hashes & modifications ↗' },
    ],
  };
}

declare const __POKEDEX_PREVIEW_ASSETS__: ModelAsset[];
const previewAdmission: ModelAsset[] = typeof __POKEDEX_PREVIEW_ASSETS__ === 'undefined' ? [] : __POKEDEX_PREVIEW_ASSETS__;
export const modelPreviewEnabled = previewAdmission.length > 0;
// Exact source identities observed in the supplied screenshot and browser rendering.
// Static models are allowed; absence of animation alone is not a pose failure.
export function rejectedModelPose(asset: Pick<ModelAsset, 'id' | 'sha256'>): string | undefined {
  const rejected: Record<string, { id: number; reason: string }> = {
  "a11a7365af8ba1d899359c3d964618c98f6037af85c7a713c380a9016efa86ce": {
    "id": 106,
    "reason": "Hitmonlee has outstretched rest-pose arms; no usable idle clip in source."
  },
  "025429fa95bd72f41c713ee86fa3bb314acbedfabfbf1ee316bdcabd8b8cbec4": {
    "id": 336,
    "reason": "Seviper is a straight vertical rest pose; no usable coil or idle clip in source."
  },
  "272d8fb7ac581519b8a7d57870ff306813aa9df9f722fc7211e46dcf880bc46c": {
    "id": 563,
    "reason": "Cofagrigus has straight outstretched rest-pose arms; no usable idle clip in source."
  },
  "302453bc350c49ba852eb200a9b897771a4eb989a675c6e5076708add3602439": {
    "id": 669,
    "reason": "Flabebe is separated from its flower in the source rest pose; no usable idle clip."
  }
};
  const review = asset.sha256 ? rejected[asset.sha256] : undefined;
  return review?.id === asset.id ? review.reason : undefined;
}

export const MODEL_TRANSFER_LIMIT = 750_000;
export const MODEL_GEOMETRY_LIMIT = 32 * 1024 * 1024;
export function admittedModel(id: number, entries: ModelAsset[] = [...previewAdmission, ...admission]): ModelAsset | undefined {
  // Source-level stray props/black geometry were verified for Gholdengo.
  return entries.find(asset => asset.id === id && asset.admitted &&
    (id !== 1000 || (asset.previewOnly && previewAdmission.some(reviewed => reviewed.id === id && reviewed.sha256 === asset.sha256))) && !rejectedModelPose(asset) && asset.bytes > 0 && asset.bytes <= MODEL_TRANSFER_LIMIT &&
    (/^https:\/\/raw\.githubusercontent\.com\/Pokemon-3D-api\/assets\/.*\.glb$/.test(asset.url) || /^\/models\/[a-z0-9-]+\.glb$/.test(asset.url)) &&
    (asset.sha256 ? /^[a-f0-9]{64}$/.test(asset.sha256) : /^[a-f0-9]{40}$/.test(asset.blobSha)));
}
export function modelEdition(species: Pokemon): CardEdition | undefined {
  const model = admittedModel(species.id);
  return model ? { ...officialEdition(species), cardId: `model-${species.id}`, sourceType: 'model',
    set: 'Interactive 3D', artist: model.credit, imageProvider: model.provider ?? 'Pokemon-3D-api assets', tcgdexUrl: model.source,
    artistEvidenceMethod: model.license, artistEvidenceUrl: model.source } : undefined;
}

export function validateModelStructure(bytes: ArrayBuffer) {
  if (bytes.byteLength < 20) throw new Error('invalid model');
  const header = new DataView(bytes);
  const jsonSize = header.getUint32(12, true);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength ||
    header.getUint32(16, true) !== 0x4e4f534a || jsonSize > bytes.byteLength - 20) throw new Error('invalid model');
  const gltf = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonSize)));
  if (!gltf.asset || gltf.asset.version !== '2.0' || (gltf.buffers ?? []).some((buffer: { uri?: string }) => buffer.uri) ||
    (gltf.images ?? []).some((image: { uri?: string }) => image.uri)) throw new Error('external model dependencies rejected');
  let decodedGeometryBytes = 0;
  for (const buffer of gltf.buffers ?? []) {
    if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0) throw new Error('invalid decoded buffer');
    decodedGeometryBytes += buffer.byteLength;
    if (decodedGeometryBytes > MODEL_GEOMETRY_LIMIT) throw new Error('decoded geometry exceeds budget');
  }
  // Meshopt allocates count * byteStride before it decodes the compressed bytes.
  let decodedMeshoptBytes = 0;
  for (const view of gltf.bufferViews ?? []) {
    const compression = view.extensions?.EXT_meshopt_compression;
    if (!compression) continue;
    if (!Number.isSafeInteger(compression.count) || compression.count < 0 ||
      !Number.isSafeInteger(compression.byteStride) || compression.byteStride <= 0 || compression.byteStride > 256) {
      throw new Error('invalid meshopt allocation');
    }
    decodedMeshoptBytes += compression.count * compression.byteStride;
    if (!Number.isSafeInteger(decodedMeshoptBytes) || decodedMeshoptBytes > MODEL_GEOMETRY_LIMIT) throw new Error('decoded geometry exceeds budget');
  }
  if ((gltf.images ?? []).length > 8 || (gltf.textures ?? []).length > 8 || (gltf.meshes ?? []).length > 32 || (gltf.animations ?? []).length > 12 ||
    (gltf.accessors ?? []).some((accessor: { count: number }) => !Number.isSafeInteger(accessor.count) || accessor.count < 0) ||
    (gltf.accessors ?? []).reduce((total: number, accessor: { count: number }) => total + accessor.count, 0) > 500_000) throw new Error('decoded model complexity exceeds budget');
  return gltf;
}

// Reject changed, oversized, or malformed bytes before decoder/GPU allocation.
export async function fetchModel(asset: ModelAsset, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Blob> {
  if (rejectedModelPose(asset)) throw new Error('model pose rejected');
  const response = await fetcher(asset.url, { signal });
  if (!response.ok || !response.body) throw new Error('model source unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > Math.min(asset.bytes, MODEL_TRANSFER_LIMIT)) throw new Error('model exceeds admission budget');
      chunks.push(new Uint8Array(value));
    }
  } finally { await reader.cancel(); }
  if (size !== asset.bytes) throw new Error('model source changed');
  const blob = new Blob(chunks, { type: 'model/gltf-binary' });
  const bytes = await blob.arrayBuffer();
  validateModelStructure(bytes);
  const gitBlob = new Blob([`blob ${size}\0`, bytes]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest(asset.sha256 ? 'SHA-256' : 'SHA-1', asset.sha256 ? bytes : await gitBlob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== (asset.sha256 ?? asset.blobSha)) throw new Error('model source identity changed');
  if (signal.aborted) throw new Error('obsolete model load');
  return blob;
}

export async function validateModelTextures(blob: Blob, signal: AbortSignal, decode: typeof createImageBitmap = createImageBitmap) {
  const bytes = await blob.arrayBuffer();
  const gltf = validateModelStructure(bytes);
  const jsonLength = new DataView(bytes).getUint32(12, true);
  const binaryStart = 20 + jsonLength + 8;
  let decodedBytes = 0;
  for (const image of gltf.images ?? []) {
    if (signal.aborted) throw new Error('obsolete model load');
    const view = gltf.bufferViews?.[image.bufferView];
    const offset = view?.byteOffset ?? 0;
    if (!view || view.buffer !== 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength <= 0 ||
      binaryStart + offset + view.byteLength > bytes.byteLength) throw new Error('invalid embedded texture');
    const bitmap = await decode(new Blob([bytes.slice(binaryStart + offset, binaryStart + offset + view.byteLength)], { type: image.mimeType }));
    try {
      // Allow mipmaps (4/3) in a conservative 32 MB active texture budget.
      decodedBytes += bitmap.width * bitmap.height * 4 * 4 / 3;
      if (bitmap.width > 2048 || bitmap.height > 2048 || decodedBytes > 32 * 1024 * 1024) throw new Error('decoded texture exceeds budget');
    } finally { bitmap.close(); }
  }
  if (signal.aborted) throw new Error('obsolete model load');
}
