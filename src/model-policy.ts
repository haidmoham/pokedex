import admission from '../content/models/admitted.json';
import { officialEdition, Pokemon, CardEdition } from './feed-model';

export type ModelAsset = { id: number; bytes: number; url: string; blobSha: string; sha256?: string; admitted: boolean; credit: string; license: string; source: string; animation?: string };
export const MODEL_TRANSFER_LIMIT = 750_000;
export function admittedModel(id: number, entries: ModelAsset[] = admission): ModelAsset | undefined {
  return entries.find(asset => asset.id === id && asset.admitted && asset.bytes > 0 && asset.bytes <= MODEL_TRANSFER_LIMIT &&
    (/^https:\/\/raw\.githubusercontent\.com\/Pokemon-3D-api\/assets\/.*\.glb$/.test(asset.url) || /^\/models\/[a-z0-9-]+\.glb$/.test(asset.url)) &&
    (asset.sha256 ? /^[a-f0-9]{64}$/.test(asset.sha256) : /^[a-f0-9]{40}$/.test(asset.blobSha)));
}
export function modelEdition(species: Pokemon): CardEdition | undefined {
  const model = admittedModel(species.id);
  return model ? { ...officialEdition(species), cardId: `model-${species.id}`, sourceType: 'model',
    set: 'Interactive 3D', artist: model.credit, imageProvider: 'Pokemon-3D-api assets', tcgdexUrl: model.source,
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
  if ((gltf.images ?? []).length > 8 || (gltf.textures ?? []).length > 8 || (gltf.meshes ?? []).length > 32 || (gltf.animations ?? []).length > 12 ||
    (gltf.accessors ?? []).some((accessor: { count: number }) => !Number.isSafeInteger(accessor.count) || accessor.count < 0) ||
    (gltf.accessors ?? []).reduce((total: number, accessor: { count: number }) => total + accessor.count, 0) > 500_000) throw new Error('decoded model complexity exceeds budget');
  return gltf;
}

// Reject changed, oversized, or malformed bytes before decoder/GPU allocation.
export async function fetchModel(asset: ModelAsset, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Blob> {
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
