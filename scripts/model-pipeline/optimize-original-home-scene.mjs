// Lossless review-derivative size pass. No texture resizing, quantization,
// triangle cycling, primitive merging or native-curve resampling.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readGlb, writeGlb } from './restore-original-home-scene.mjs';

const fail = message => { throw new Error(message); };
const clone = value => structuredClone(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const align4 = n => (n + 3) & ~3;
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeItems = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function payload(json, binary, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor?.bufferView];
  const element = componentBytes[accessor?.componentType] * typeItems[accessor?.type];
  if (!accessor || !view || !element || accessor.sparse || accessor.count <= 0 || view.byteStride || view.extensions ||
    accessor.byteOffset % componentBytes[accessor.componentType]) fail(`Unsupported animation accessor: ${index}`);
  const relative = accessor.byteOffset ?? 0, begin = (view.byteOffset ?? 0) + relative, length = accessor.count * element;
  if (relative + length > view.byteLength || begin + length > binary.length) fail(`Animation accessor outside source view: ${index}`);
  return binary.subarray(begin, begin + length);
}

function sourceReferences(json) {
  const animation = new Set(), other = new Set();
  if (json.animations?.length !== 1 || json.animations[0].name !== 'HOME Idle') fail('One native HOME Idle required');
  for (const sampler of json.animations[0].samplers) animation.add(sampler.input).add(sampler.output);
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) other.add(skin.inverseBindMatrices);
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.indices !== undefined) other.add(primitive.indices);
    Object.values(primitive.attributes ?? {}).forEach(index => other.add(index));
    for (const target of primitive.targets ?? []) Object.values(target).forEach(index => other.add(index));
  }
  if ([...animation, ...other].some(index => !Number.isInteger(index) || index < 0 || index >= json.accessors.length) ||
    [...animation].some(index => other.has(index))) fail('Invalid or shared animation/geometry accessor');
  return { animation, other };
}

function append(state, bytes) {
  const padding = align4(state.length) - state.length;
  if (padding) state.parts.push(Buffer.alloc(padding));
  state.length += padding;
  const offset = state.length;
  state.parts.push(bytes); state.length += bytes.length;
  return offset;
}

/** Removes byte-identical repeated native accessor payloads, not keyframes. */
export function deduplicateNativeAccessors(bytes) {
  const { json: original, binary } = readGlb(bytes);
  if (original.buffers.length !== 1 || original.extensionsUsed?.includes('EXT_meshopt_compression') ||
    original.asset?.extras?.homeReconstruction?.status !== 'local-review-only') fail('Uncompressed review reconstruction required');
  const json = clone(original), { animation, other } = sourceReferences(json);
  const usedViews = new Set([...other].map(index => json.accessors[index].bufferView));
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined || image.uri) fail('Embedded original PNG required');
    usedViews.add(image.bufferView);
  }
  const state = { parts: [], length: 0 }, newViews = [], viewRemap = new Map();
  for (let index = 0; index < json.bufferViews.length; index++) {
    if (!usedViews.has(index)) continue;
    const view = json.bufferViews[index];
    if (view.buffer !== 0 || view.extensions || view.byteLength <= 0 || (view.byteOffset ?? 0) + view.byteLength > binary.length) fail(`Invalid original buffer view: ${index}`);
    const copied = clone(view);
    copied.byteOffset = append(state, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    viewRemap.set(index, newViews.push(copied) - 1);
  }
  const newAccessors = [], accessorRemap = new Map();
  json.accessors.forEach((accessor, index) => {
    if (animation.has(index)) return;
    const view = viewRemap.get(accessor.bufferView);
    if (view === undefined || accessor.sparse) fail(`Unmapped original accessor: ${index}`);
    accessorRemap.set(index, newAccessors.push({ ...accessor, bufferView: view }) - 1);
  });
  const groups = new Map(), identical = new Map();
  for (const index of animation) {
    const accessor = json.accessors[index], data = payload(json, binary, index);
    const attributes = clone(accessor);
    delete attributes.bufferView; delete attributes.byteOffset;
    const key = `${JSON.stringify(attributes)}|${sha256(data)}`;
    let next = identical.get(key);
    if (next === undefined) {
      next = newAccessors.length;
      identical.set(key, next);
      const stride = componentBytes[accessor.componentType] * typeItems[accessor.type];
      const group = groups.get(stride) ?? { parts: [], length: 0, accessorIndices: [] };
      if (!groups.has(stride)) groups.set(stride, group);
      newAccessors.push({ ...attributes, byteOffset: append(group, data) });
      group.accessorIndices.push(next);
    }
    accessorRemap.set(index, next);
  }
  for (const group of groups.values()) {
    const packedView = newViews.push({ buffer: 0, byteOffset: append(state, Buffer.concat(group.parts)),
      byteLength: group.length }) - 1;
    for (const index of group.accessorIndices) newAccessors[index].bufferView = packedView;
  }
  json.accessors = newAccessors;
  json.bufferViews = newViews;
  for (const image of json.images ?? []) image.bufferView = viewRemap.get(image.bufferView);
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorRemap.get(skin.inverseBindMatrices);
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.indices !== undefined) primitive.indices = accessorRemap.get(primitive.indices);
    for (const key of Object.keys(primitive.attributes ?? {})) primitive.attributes[key] = accessorRemap.get(primitive.attributes[key]);
    for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) target[key] = accessorRemap.get(target[key]);
  }
  for (const sampler of json.animations[0].samplers) {
    sampler.input = accessorRemap.get(sampler.input); sampler.output = accessorRemap.get(sampler.output);
  }
  json.buffers[0].byteLength = state.length;
  const result = writeGlb(json, Buffer.concat(state.parts));
  return { bytes: result, removedAccessors: original.accessors.length - newAccessors.length,
    animationBytesBefore: [...new Set([...animation].map(index => original.accessors[index].bufferView))]
      .reduce((total, index) => total + original.bufferViews[index].byteLength, 0),
    animationBytesAfter: [...groups.values()].reduce((total, group) => total + group.length, 0) };
}

/** Optional PNG recompression: pixel bytes and color-space class must match. */
export async function reencodeOriginalPngLossless(bytes) {
  const { json: original, binary } = readGlb(bytes);
  if (original.buffers.length !== 1 || original.extensionsUsed?.includes('EXT_meshopt_compression') ||
    original.asset?.extras?.homeReconstruction?.status !== 'local-review-only') fail('Uncompressed review reconstruction required');
  const json = clone(original), imageViews = new Set((json.images ?? []).map(image => image.bufferView));
  const replacements = new Map();
  for (const index of imageViews) {
    const image = original.images.find(item => item.bufferView === index);
    if (image.mimeType === 'image/webp') continue; // Exact pinned Atlas special-effect image.
    if (image.mimeType !== 'image/png') fail('Unsupported embedded image type');
    const view = original.bufferViews[index];
    const source = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const input = sharp(source), inputMeta = await input.metadata();
    if (inputMeta.format !== 'png' || inputMeta.hasProfile || inputMeta.depth !== 'uchar') continue;
    const candidate = await sharp(source).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer();
    if (candidate.length >= source.length) continue;
    const outputMeta = await sharp(candidate).metadata();
    const decodedSource = await sharp(source).raw().toBuffer();
    const decodedCandidate = await sharp(candidate).raw().toBuffer();
    if (inputMeta.width !== outputMeta.width || inputMeta.height !== outputMeta.height ||
      inputMeta.space !== outputMeta.space || inputMeta.channels !== outputMeta.channels ||
      inputMeta.hasAlpha !== outputMeta.hasAlpha || !decodedSource.equals(decodedCandidate)) fail('PNG re-encoding changed original pixels');
    replacements.set(index, candidate);
  }
  const state = { parts: [], length: 0 };
  for (let index = 0; index < json.bufferViews.length; index++) {
    const view = json.bufferViews[index];
    const data = replacements.get(index) ?? binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    view.byteOffset = append(state, data);
    view.byteLength = data.length;
  }
  json.buffers[0].byteLength = state.length;
  return { bytes: writeGlb(json, Buffer.concat(state.parts)), reencodedPngCount: replacements.size,
    savedPngBytes: [...replacements].reduce((total, [index, data]) => total + original.bufferViews[index].byteLength - data.length, 0) };
}

/** Compresses numeric views with Meshopt and verifies exact decoded bytes. */
export async function compressOriginalHomeScene(bytes) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const { json: original, binary } = readGlb(bytes);
  if (original.buffers.length !== 1 || original.extensionsUsed?.includes('EXT_meshopt_compression') ||
    original.asset?.extras?.homeReconstruction?.status !== 'local-review-only') fail('Uncompressed review reconstruction required');
  const json = clone(original), imageViews = new Set((json.images ?? []).map(image => image.bufferView));
  const strides = new Map();
  for (const accessor of original.accessors) {
    const width = componentBytes[accessor.componentType] * typeItems[accessor.type];
    const prior = strides.get(accessor.bufferView);
    strides.set(accessor.bufferView, prior === undefined ? width : prior === width ? width : 0);
  }
  const state = { parts: [], length: 0 };
  let fallbackLength = 0, compressed = 0, unchanged = 0;
  for (let index = 0; index < json.bufferViews.length; index++) {
    const source = original.bufferViews[index], view = json.bufferViews[index];
    if (source.buffer !== 0 || source.extensions || source.byteLength <= 0 ||
      (source.byteOffset ?? 0) + source.byteLength > binary.length) fail(`Invalid source buffer view: ${index}`);
    const raw = binary.subarray(source.byteOffset ?? 0, (source.byteOffset ?? 0) + source.byteLength);
    if (!imageViews.has(index)) {
      const preferred = source.byteStride ?? strides.get(index);
      const mode = 'ATTRIBUTES'; // TRIANGLES may cycle indices; keep byte-exact order.
      const stride = preferred && preferred % 4 === 0 && preferred <= 256 && raw.length % preferred === 0 ? preferred : 4;
      const decoded = Buffer.alloc(Math.ceil(raw.length / stride) * stride);
      raw.copy(decoded);
      const count = decoded.length / stride;
      const encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(decoded, count, stride, mode));
      const verified = new Uint8Array(decoded.length);
      MeshoptDecoder.decodeGltfBuffer(verified, count, stride, encoded, mode, 'NONE');
      if (!Buffer.from(verified).equals(decoded)) fail(`Meshopt byte roundtrip changed: ${index}`);
      if (encoded.length + 96 < raw.length) {
        const offset = append(state, encoded);
        view.buffer = 1;
        view.byteOffset = fallbackLength;
        view.byteLength = decoded.length;
        view.extensions = { ...view.extensions, EXT_meshopt_compression: { buffer: 0,
          byteOffset: offset, byteLength: encoded.length, byteStride: stride, count, mode } };
        fallbackLength += decoded.length;
        compressed++;
        continue;
      }
    }
    view.buffer = 0;
    view.byteOffset = append(state, raw);
    unchanged++;
  }
  if (!compressed) fail('No lossless Meshopt savings');
  json.buffers = [{ byteLength: state.length }, { byteLength: fallbackLength,
    extensions: { EXT_meshopt_compression: { fallback: true } } }];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_meshopt_compression'])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_meshopt_compression'])];
  const output = writeGlb(json, Buffer.concat(state.parts));
  const check = readGlb(output);
  for (let index = 0; index < original.bufferViews.length; index++) {
    const source = original.bufferViews[index], view = check.json.bufferViews[index];
    const expected = binary.subarray(source.byteOffset ?? 0, (source.byteOffset ?? 0) + source.byteLength);
    let actual;
    if (view.extensions?.EXT_meshopt_compression) {
      const ext = view.extensions.EXT_meshopt_compression;
      actual = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(actual, ext.count, ext.byteStride,
        check.binary.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength), ext.mode, ext.filter ?? 'NONE');
      actual = Buffer.from(actual).subarray(0, expected.length);
    } else actual = check.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    if (!actual.equals(expected)) fail(`Compressed scene changed source bytes: ${index}`);
  }
  return { bytes: output, compressedViews: compressed, uncompressedViews: unchanged };
}

/** Strictly lossless local size pass for original HOME reconstructions. */
export async function optimizeOriginalHomeScene(bytes) {
  const deduplicated = deduplicateNativeAccessors(bytes);
  let compressed = await compressOriginalHomeScene(deduplicated.bytes);
  let reencoded = null;
  if (compressed.bytes.length > 750000) {
    const candidate = await reencodeOriginalPngLossless(deduplicated.bytes);
    if (candidate.reencodedPngCount && compressed.bytes.length - candidate.savedPngBytes <= 750000) {
      const imageCompressed = await compressOriginalHomeScene(candidate.bytes);
      if (imageCompressed.bytes.length < compressed.bytes.length && imageCompressed.bytes.length <= 750000) {
        compressed = imageCompressed;
        reencoded = candidate;
      }
    }
  }
  return { bytes: compressed.bytes, metrics: { sourceBytes: bytes.length, bytes: compressed.bytes.length,
    sha256: sha256(compressed.bytes), transferBudgetPass: compressed.bytes.length <= 750000,
    animationBytesBefore: deduplicated.animationBytesBefore, animationBytesAfter: deduplicated.animationBytesAfter,
    removedAccessors: deduplicated.removedAccessors, compressedViews: compressed.compressedViews,
    uncompressedViews: compressed.uncompressedViews, geometryAndCurvesByteExactAfterDecode: true,
    originalPngBytesPreserved: !reencoded, originalPngPixelsPreserved: true,
    reencodedPngCount: reencoded?.reencodedPngCount ?? 0, admitted: false, published: false } };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [input, output, metricsPath] = process.argv.slice(2);
  if (!input || !output || !metricsPath) fail('Usage: optimize-original-home-scene.mjs INPUT_GLB OUTPUT_GLB METRICS_JSON');
  const result = await optimizeOriginalHomeScene(await readFile(input));
  await writeFile(output, result.bytes);
  await writeFile(metricsPath, JSON.stringify(result.metrics, null, 2) + '\n');
  console.log(JSON.stringify(result.metrics));
}
