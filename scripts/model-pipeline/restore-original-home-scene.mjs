// Rebuild a review-only HOME scene from its original, unmerged GLB. The pinned
// Atlas derivative supplies native Idle curves, never its merged geometry or
// baked materials. No output from this file is admitted or published.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const clone = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const align4 = n => (n + 3) & ~3;

// Independently audited original Unity mesh streams omit TEXCOORD_1. Unity's
// documented missing-vertex-input default is (0,0); the source GLB reflects V,
// hence (0,1). Each exception is bound to an exact raw GLB and mesh. This is a
// source default, not recovered authored UVs and never a copy of TEXCOORD_0.
export const OMITTED_UV1 = Object.freeze({
  949: { rawSha256: '2831dab2ec83701e93aa6b3999bae8ce53bd9414a1347378541c614a158568bc', meshes: { pm0949_00_00_TraSkin: '24452f506faf0fabda99f18e88a9083ff0893ce2' } },
  954: { rawSha256: 'b71c3efad091cd2341bc1340e2236f7e367e0bc9dacb272ebb4f14d5b70dafed', meshes: { pm0954_00_00_BodyASkin: '849945527b8140bc194f6121de352cac9fe58716' } },
  1008: { rawSha256: 'a9920d20bb9db744ef46a0823810aa5b4ae0ee6a10087eb0b0c90acb5474210c', meshes: {
    CusAnimVis_pm1008_11_00_AntennaSkin: 'a8905800107d8e8e01f101b5ba27c197fc71e139',
    pm1008_11_00_EyeSkin: 'c647b649230453954144dcfeaf7781327949f893',
  } },
  1024: { rawSha256: '87bd79bc5d2433ee18f6c8b180678655edd0968db325f2ef9ff2458a4dfba032', meshes: { pm1024_11_00_BodyASkin: '3fcde0da92d4a72d2a2a57ea87bf2cd940735053' } },
});

export function readGlb(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 28 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) fail('Invalid GLB');
  let offset = 12, json, binary;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) fail('Invalid GLB chunk');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a && !json) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942 && !binary) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary || ![1, 2].includes(json.buffers?.length) || json.buffers[0].uri ||
    json.buffers[0].byteLength > binary.length ||
    (json.buffers.length === 2 && (json.buffers[1].uri || !json.buffers[1].extensions?.EXT_meshopt_compression?.fallback))) {
    fail('Self-contained GLB with at most one Meshopt fallback buffer required');
  }
  return { json, binary };
}

export function writeGlb(json, binary) {
  const serialized = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc(align4(serialized.length), 0x20);
  serialized.copy(jsonChunk);
  const binChunk = Buffer.alloc(align4(binary.length));
  binary.copy(binChunk);
  const out = Buffer.allocUnsafe(12 + 8 + jsonChunk.length + 8 + binChunk.length);
  out.write('glTF', 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonChunk.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader); out.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  return out;
}

function nodeTable(json) {
  const parents = Array(json.nodes.length).fill(null);
  json.nodes.forEach((node, index) => (node.children ?? []).forEach(child => {
    if (!Number.isInteger(child) || child < 0 || child >= json.nodes.length || parents[child] !== null) fail('Invalid scene hierarchy');
    parents[child] = index;
  }));
  const names = new Map();
  json.nodes.forEach((node, index) => {
    if (!node.name || names.has(node.name)) fail(`Ambiguous scene node: ${node.name}`);
    names.set(node.name, index);
  });
  return { names, parents };
}

function localTransform(node) {
  return { translation: node.translation ?? [0, 0, 0], rotation: node.rotation ?? [0, 0, 0, 1], scale: node.scale ?? [1, 1, 1], matrix: node.matrix ?? null };
}

function closeTransform(a, b) {
  const x = localTransform(a), y = localTransform(b);
  return Object.keys(x).every(key => x[key] === null ? y[key] === null :
    x[key].length === y[key]?.length && x[key].every((v, i) => Math.abs(v - y[key][i]) <= 1e-5));
}

function accessorBytes(json, binary, index) {
  const accessor = json.accessors?.[index], view = json.bufferViews?.[accessor?.bufferView];
  if (!accessor || !view || accessor.sparse || view.extensions || view.byteStride || accessor.componentType !== 5126 || accessor.type !== 'MAT4') fail('Unsupported inverse-bind accessor');
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), length = accessor.count * 64;
  if (start + length > binary.length) fail('Inverse-bind buffer exceeds GLB');
  return binary.subarray(start, start + length);
}

function verifyRig(raw, atlas) {
  const source = nodeTable(raw.json), native = nodeTable(atlas.json);
  for (const [name, atlasIndex] of native.names) {
    const rawIndex = source.names.get(name);
    if (rawIndex === undefined) continue; // The original can have extra meshes, Atlas may have helper nodes.
    const rawNode = raw.json.nodes[rawIndex], atlasNode = atlas.json.nodes[atlasIndex];
    if (!closeTransform(rawNode, atlasNode)) fail(`Changed local rest transform: ${name}`);
    const rawParent = source.parents[rawIndex], atlasParent = native.parents[atlasIndex];
    if ((rawParent === null ? null : raw.json.nodes[rawParent].name) !==
        (atlasParent === null ? null : atlas.json.nodes[atlasParent].name)) fail(`Changed node parent: ${name}`);
    if (atlasNode.skin !== undefined) {
      if (rawNode.skin === undefined) fail(`Missing original skin: ${name}`);
      const sourceSkin = raw.json.skins[rawNode.skin], nativeSkin = atlas.json.skins[atlasNode.skin];
      const jointNames = (json, skin) => skin.joints.map(index => json.nodes[index].name);
      if (!equal(jointNames(raw.json, sourceSkin), jointNames(atlas.json, nativeSkin)) ||
        !accessorBytes(raw.json, raw.binary, sourceSkin.inverseBindMatrices).equals(
          accessorBytes(atlas.json, atlas.binary, nativeSkin.inverseBindMatrices))) fail(`Changed skin binding: ${name}`);
    }
  }
  return { source, native };
}

function appendBytes(state, bytes) {
  const pad = align4(state.length) - state.length;
  if (pad) state.parts.push(Buffer.alloc(pad));
  state.length += pad;
  const offset = state.length;
  state.parts.push(bytes); state.length += bytes.length;
  return offset;
}

function copyNativeAnimation(raw, atlas, state, tables) {
  const clips = atlas.json.animations?.filter(item => item.name === 'HOME Idle') ?? [];
  if (clips.length !== 1 || raw.json.animations?.length) fail('One native HOME Idle and animation-free original required');
  const clip = clone(clips[0]);
  if (!Number.isFinite(clip.extras?.homeDuration) || clip.extras.homeDuration <= 0) fail('Native HOME loop duration missing');
  const accessors = new Map(), views = new Map();
  function copyView(index) {
    if (views.has(index)) return views.get(index);
    const source = atlas.json.bufferViews[index];
    if (!source || source.buffer !== 0 || source.extensions || source.byteStride) fail('Unsupported native animation buffer view');
    const begin = source.byteOffset ?? 0, end = begin + source.byteLength;
    if (end > atlas.binary.length) fail('Native animation view exceeds GLB');
    const copied = { ...source, buffer: 0, byteOffset: appendBytes(state, atlas.binary.subarray(begin, end)) };
    const result = raw.json.bufferViews.push(copied) - 1;
    views.set(index, result);
    return result;
  }
  function copyAccessor(index) {
    if (accessors.has(index)) return accessors.get(index);
    const source = atlas.json.accessors[index];
    if (!source || source.sparse || source.bufferView === undefined) fail('Unsupported native animation accessor');
    const copied = { ...clone(source), bufferView: copyView(source.bufferView) };
    const result = raw.json.accessors.push(copied) - 1;
    accessors.set(index, result);
    return result;
  }
  for (const channel of clip.channels) {
    if (!['translation', 'rotation', 'scale'].includes(channel.target.path)) fail('Unsupported native animation path');
    const name = atlas.json.nodes[channel.target.node]?.name, target = tables.source.names.get(name);
    if (target === undefined || !name || tables.native.names.get(name) !== channel.target.node) fail(`Unmatched native target: ${name}`);
    channel.target.node = target;
  }
  for (const sampler of clip.samplers) {
    sampler.input = copyAccessor(sampler.input);
    sampler.output = copyAccessor(sampler.output);
  }
  raw.json.animations = [clip];
  return { channels: clip.channels.length, duration: clip.extras.homeDuration, accessorCount: accessors.size };
}

function normalizeTexture(slot, uv, shift) {
  if (!slot || ![0, 1].includes(uv) || ![0, 1, 2].includes(slot.wrap?.[0]) || ![0, 1, 2].includes(slot.wrap?.[1]) ||
    !Array.isArray(slot.repeat) || !Array.isArray(slot.offset) || !Array.isArray(shift) ||
    [...slot.repeat, ...slot.offset, ...shift].some(value => !Number.isFinite(value))) fail('Unsupported source texture transform');
  const [sx, sy] = slot.repeat, [ox, oy] = slot.offset;
  return { path: slot.path, uv, wrap: slot.wrap, offset: [ox + shift[0], 1 - sy - oy - shift[1]], scale: [sx, sy] };
}

function sourceMaterial(rawMaterial, atlasMaterial, source, addTexture, review) {
  if (!source) fail(`Unmapped original material: ${rawMaterial.name}`);
  const f = source.floats ?? {}, baseUv = f._ColorMapUvIndex ?? 0, layerUv = f._Layer1UvIndex ?? 0;
  const base = source.map ? normalizeTexture(source.map, baseUv, [f._ColorBaseU ?? 0, f._ColorBaseV ?? 0]) : null;
  const layer = source.layer && f._Layer1Enable ? normalizeTexture(source.layer, layerUv, [f._Layer1BaseU ?? 0, f._Layer1BaseV ?? 0]) : null;
  const emission = source.emissiveMap && f._EmissionMaskUse ? normalizeTexture(source.emissiveMap,
    f._SwitchEmissionMaskTexUV ?? baseUv, [f._ColorBaseU ?? 0, f._ColorBaseV ?? 0]) : null;
  if (!base) fail(`Missing original base map: ${rawMaterial.name}`);
  const out = clone(rawMaterial);
  const atlasPbr = atlasMaterial?.pbrMetallicRoughness ?? {};
  out.pbrMetallicRoughness = { roughnessFactor: atlasPbr.roughnessFactor ?? 0.55,
    metallicFactor: atlasPbr.metallicFactor ?? 0.05, baseColorTexture: addTexture(base) };
  if (f._BlendMode === 1) out.alphaMode = 'BLEND';
  else if (f._BlendMode === 2 && f._SrcBlend === 5 && f._DstBlend === 1) {
    out.alphaMode = 'BLEND'; out.extras = { ...out.extras, homeBlend: 'additive' };
  } else if (f._BlendMode !== 0) fail(`Unsupported source blend: ${rawMaterial.name}`);
  out.doubleSided = f._CullMode === 0;
  const descriptor = { base: { ...base, texture: out.pbrMetallicRoughness.baseColorTexture.index } };
  if (layer) {
    descriptor.layer = { ...layer, texture: addTexture(layer).index };
    descriptor.composite = { equation: 'atlas-alpha-over-review', baseUv, layerUv,
      layerCalcMulti: f._LayerCalcMulti ?? 0, layerOverLerpValue: f._Layer1OverLerpValue ?? 1,
      layerBlendMode: f._LayerBlendMode ?? 0 };
    if (baseUv !== layerUv) out.extras = { ...out.extras, homeLayerUv: { base: baseUv, layer: layerUv } };
    // Original Unity Gen9 blend equations are not recovered. Runtime may show
    // the Atlas-style approximation only after explicit visual review.
    review.push({ material: out.name, reason: 'unverified-original-layer-equation', sameUv: baseUv === layerUv });
  }
  if (emission) {
    descriptor.emissionMask = { ...emission, texture: addTexture(emission).index };
    const c = source.colors?._EmissionColor;
    if (c) out.emissiveFactor = [c.r, c.g, c.b];
  }
  out.extras = { ...out.extras, homeSourceTextures: descriptor };
  return out;
}

/** Reconstruct a local, review-only scene. Caller supplies already-pinned source bytes. */
export function restoreOriginalHomeScene({ id, rawBytes, atlasBytes, sourceMaterials, textureBytesByPath }) {
  if (!Number.isInteger(id) || id < 1 || id > 1025) fail('Valid species ID required');
  if (!rawBytes || !atlasBytes || rawBytes.length > 32 * 1024 * 1024 || atlasBytes.length > 8 * 1024 * 1024) fail('Bounded source GLBs required');
  const raw = readGlb(rawBytes), atlas = readGlb(atlasBytes);
  if (!Array.isArray(raw.json.meshes) || !Array.isArray(raw.json.materials) || !Array.isArray(raw.json.skins) ||
    !Array.isArray(atlas.json.animations) || !sourceMaterials || typeof sourceMaterials !== 'object') fail('Incomplete HOME source');
  if (raw.json.extensionsRequired?.length || raw.json.images?.length || raw.json.textures?.length) fail('Unexpected altered original geometry');
  const originalRaw = clone(raw.json), originalBinary = Buffer.from(raw.binary);
  const tables = verifyRig(raw, atlas), state = { parts: [raw.binary], length: raw.binary.length };
  const animation = copyNativeAnimation(raw, atlas, state, tables);
  const rawHash = sha256(rawBytes), defaultEvidence = OMITTED_UV1[id], defaulted = [];
  const atlasMaterials = new Map(atlas.json.materials?.map(material => [material.name, material]) ?? []);
  const imageCache = new Map(), samplerCache = new Map(), textureCache = new Map(), review = [];
  raw.json.images = []; raw.json.samplers = []; raw.json.textures = [];
  function addTexture(spec) {
    const bytes = textureBytesByPath?.[spec.path];
    if (!bytes || bytes.length < 8 || !Buffer.from(bytes).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail(`Missing pinned PNG: ${spec.path}`);
    const key = `${spec.path}|${spec.wrap.join(',')}`;
    let image = imageCache.get(spec.path);
    if (image === undefined) {
      const view = raw.json.bufferViews.push({ buffer: 0, byteOffset: appendBytes(state, Buffer.from(bytes)), byteLength: bytes.length }) - 1;
      image = raw.json.images.push({ bufferView: view, mimeType: 'image/png', name: spec.path.split('/').at(-1) }) - 1;
      imageCache.set(spec.path, image);
    }
    let sampler = samplerCache.get(spec.wrap.join(','));
    if (sampler === undefined) {
      const wrapping = mode => [10497, 33071, 33648][mode];
      sampler = raw.json.samplers.push({ wrapS: wrapping(spec.wrap[0]), wrapT: wrapping(spec.wrap[1]) }) - 1;
      samplerCache.set(spec.wrap.join(','), sampler);
    }
    let texture = textureCache.get(key);
    if (texture === undefined) {
      texture = raw.json.textures.push({ source: image, sampler }) - 1;
      textureCache.set(key, texture);
    }
    const info = { index: texture, texCoord: spec.uv };
    if (!equal(spec.offset, [0, 0]) || !equal(spec.scale, [1, 1])) {
      info.extensions = { KHR_texture_transform: { offset: spec.offset, scale: spec.scale, texCoord: spec.uv } };
      raw.json.extensionsUsed = [...new Set([...(raw.json.extensionsUsed ?? []), 'KHR_texture_transform'])];
    }
    return info;
  }
  raw.json.materials = raw.json.materials.map(material => sourceMaterial(material, atlasMaterials.get(material.name),
    sourceMaterials[material.name], addTexture, review));
  // The missing-input default is only legal for five independently audited
  // source mesh assets across four species; every other absence is a failure.
  for (const mesh of raw.json.meshes) for (const primitive of mesh.primitives) {
    const material = raw.json.materials[primitive.material], descriptor = material.extras.homeSourceTextures;
    const needsUv1 = [descriptor.base, descriptor.layer, descriptor.emissionMask].filter(Boolean).some(item => item.uv === 1);
    if (!needsUv1 || primitive.attributes.TEXCOORD_1 !== undefined) continue;
    if (!defaultEvidence || rawHash !== defaultEvidence.rawSha256 || !defaultEvidence.meshes[mesh.name]) {
      fail(`Missing original secondary UV without source-default proof: ${mesh.name} / ${material.name}`);
    }
    const position = raw.json.accessors[primitive.attributes.POSITION];
    const values = Buffer.alloc(position.count * 8);
    for (let i = 0; i < position.count; i++) values.writeFloatLE(1, i * 8 + 4);
    const view = raw.json.bufferViews.push({ buffer: 0, byteOffset: appendBytes(state, values), byteLength: values.length }) - 1;
    primitive.attributes.TEXCOORD_1 = raw.json.accessors.push({ bufferView: view, componentType: 5126, count: position.count, type: 'VEC2',
      min: [0, 1], max: [0, 1] }) - 1;
    defaulted.push({ mesh: mesh.name, material: material.name, vertices: position.count,
      sourceMeshBlob: defaultEvidence.meshes[mesh.name] });
  }
  raw.json.buffers[0].byteLength = state.length;
  raw.json.asset.extras = { ...raw.json.asset.extras, homeReconstruction: { status: 'local-review-only',
    geometrySha256: rawHash, nativeIdleSourceSha256: sha256(atlasBytes), sourceDefaultUv1: defaulted.length,
    originalShaderEquation: 'unverified' } };
  const output = writeGlb(raw.json, Buffer.concat(state.parts));
  const roundtrip = readGlb(output);
  const derivativeMeshes = clone(roundtrip.json.meshes);
  for (let meshIndex = 0; meshIndex < originalRaw.meshes.length; meshIndex++) {
    const originalPrimitives = originalRaw.meshes[meshIndex].primitives;
    const rebuiltPrimitives = derivativeMeshes[meshIndex]?.primitives;
    if (originalPrimitives.length !== rebuiltPrimitives?.length) fail('Original primitive count changed');
    for (let primitiveIndex = 0; primitiveIndex < originalPrimitives.length; primitiveIndex++) {
      if (originalPrimitives[primitiveIndex].attributes.TEXCOORD_1 === undefined &&
          rebuiltPrimitives[primitiveIndex].attributes.TEXCOORD_1 !== undefined) {
        delete rebuiltPrimitives[primitiveIndex].attributes.TEXCOORD_1;
      }
    }
  }
  if (!originalBinary.equals(roundtrip.binary.subarray(0, originalBinary.length)) ||
    !equal(originalRaw.meshes, derivativeMeshes)) {
    // Only independently proven source-default UV attributes may be
    // added; all authored original primitive attributes remain exact.
    fail('Original geometry changed');
  }
  return { bytes: output, metrics: { id, bytes: output.length, sha256: sha256(output), rawSha256: rawHash,
    atlasSha256: sha256(atlasBytes), nativeIdle: animation, materialCount: raw.json.materials.length,
    originalPrimitiveCount: originalRaw.meshes.reduce((n, mesh) => n + mesh.primitives.length, 0),
    sourceDefaultUv1: defaulted, visualReviewRequired: review, admitted: false, published: false,
    transferBudgetPass: output.length <= 750000 } };
}

async function cli() {
  const [idText, geometryRoot, atlasRoot, unityRoot, companionsPath, materialMapPath, identitiesPath, atlasCatalogPath, outPath, metricsPath] = process.argv.slice(2);
  if (![idText, geometryRoot, atlasRoot, unityRoot, companionsPath, materialMapPath, identitiesPath, atlasCatalogPath, outPath, metricsPath].every(Boolean)) {
    fail('Usage: restore-original-home-scene.mjs ID GEOMETRY_ROOT ATLAS_ROOT UNITY_ROOT COMPANIONS_JSON MATERIAL_MAP_JSON SELECTED_IDENTITIES_JSON ATLAS_SOURCE_CATALOG_JSON OUTPUT_GLB METRICS_JSON');
  }
  const id = Number(idText), companions = JSON.parse(await readFile(companionsPath));
  const materialMapBytes = await readFile(materialMapPath);
  if (sha256(materialMapBytes) !== '0b52b67120625b21d8e0f17c632897118b39adad02b175837fb90a95ae7f5983') fail('Original material map identity mismatch');
  const mappings = JSON.parse(materialMapBytes);
  const identities = JSON.parse(await readFile(identitiesPath));
  const atlasCatalog = JSON.parse(await readFile(atlasCatalogPath));
  if (companions.geometryRevision !== '27703273836f38f0e185976d955b1fbfb15448af' ||
    companions.materialMotionRevision !== '7b18d1a3e22df48329220ea99c4d2a6617d72345' ||
    mappings.geometryRevision !== companions.geometryRevision || mappings.textureRevision !== companions.materialMotionRevision ||
    identities.revision !== companions.materialMotionRevision ||
    atlasCatalog.atlasRevision !== 'ef25889c60f099aa864bed11042f4054827a78c4') fail('Source revision drift');
  const source = companions.sources.find(row => row.id === id), mapping = mappings.models?.[String(id)];
  if (!source || !mapping || mapping.geometry !== source.geometry.path) fail(`Pinned source selection unavailable: ${id}`);
  const rawBytes = await readFile(join(geometryRoot, source.geometry.path));
  if (rawBytes.length !== source.geometry.bytes || sha256(rawBytes) !== source.geometry.sha256 || gitBlob(rawBytes) !== source.geometry.blobSha) fail('Original geometry identity mismatch');
  const atlasBytes = await readFile(join(atlasRoot, `${id}.glb`));
  const atlasIdentity = atlasCatalog.records?.find(row => row.id === id)?.atlas;
  if (!atlasIdentity || atlasIdentity.bytes !== atlasBytes.length || atlasIdentity.blobSha !== gitBlob(atlasBytes)) fail('Atlas source identity mismatch');
  const atlas = readGlb(atlasBytes);
  if (atlas.json.animations?.filter(item => item.name === 'HOME Idle').length !== 1) fail('Pinned Atlas native Idle unavailable');
  const fileIdentities = new Map(identities.files.map(item => [item.path, item]));
  const textureBytesByPath = {};
  const geometry = readGlb(rawBytes);
  for (const material of geometry.json.materials) {
    const mapped = mapping.materials[material.name];
    if (!mapped) fail(`Unmapped original material: ${material.name}`);
    for (const kind of ['map', 'layer', 'emissiveMap']) {
      const path = mapped[kind]?.path;
      if (!path || textureBytesByPath[path]) continue;
      const identity = fileIdentities.get(path);
      if (!identity) fail(`Unpinned source texture: ${path}`);
      const bytes = await readFile(join(unityRoot, path));
      if (bytes.length !== identity.bytes || sha256(bytes) !== identity.sha256 || gitBlob(bytes) !== identity.blobSha) fail(`Source texture identity mismatch: ${path}`);
      textureBytesByPath[path] = bytes;
    }
  }
  const result = restoreOriginalHomeScene({ id, rawBytes, atlasBytes, sourceMaterials: mapping.materials, textureBytesByPath });
  await writeFile(outPath, result.bytes);
  await writeFile(metricsPath, JSON.stringify(result.metrics, null, 2) + '\n');
  console.log(JSON.stringify(result.metrics));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await cli();
