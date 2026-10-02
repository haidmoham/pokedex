// Deduplicate byte-for-byte identical animation accessor metadata after the
// lossless native Meshopt pass. No keyframe, interpolation, required min/max,
// geometry, skin, image, or binary-buffer bytes are removed or resampled.
export function compactAnimationAccessors(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw Error('Invalid GLB');
  const jsonLength = bytes.readUInt32LE(12), binaryHeader = 20 + jsonLength;
  if (binaryHeader + 8 > bytes.length || bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942 ||
      bytes.readUInt32LE(binaryHeader) !== bytes.length - binaryHeader - 8) throw Error('Invalid GLB chunks');
  const gltf = JSON.parse(bytes.subarray(20, binaryHeader).toString('utf8'));
  if (!Array.isArray(gltf.accessors) || !Array.isArray(gltf.animations) || gltf.animations.length !== 1) {
    throw Error('Expected one native animation and accessors');
  }
  const binary = bytes.subarray(binaryHeader + 8);
  const animation = new Set(gltf.animations.flatMap(clip => clip.samplers.flatMap(sampler => [sampler.input, sampler.output])));
  const nonAnimation = new Set();
  for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) nonAnimation.add(skin.inverseBindMatrices);
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.indices !== undefined) nonAnimation.add(primitive.indices);
    for (const index of Object.values(primitive.attributes ?? {})) nonAnimation.add(index);
    for (const target of primitive.targets ?? []) for (const index of Object.values(target)) nonAnimation.add(index);
  }
  if ([...animation, ...nonAnimation].some(index => !Number.isInteger(index) || index < 0 || index >= gltf.accessors.length) ||
      [...animation].some(index => nonAnimation.has(index))) throw Error('Invalid or shared geometry/animation accessor');
  const accessors = [], remap = new Map(), identical = new Map();
  gltf.accessors.forEach((accessor, index) => {
    if (!animation.has(index)) { remap.set(index, accessors.length); accessors.push(accessor); return; }
    if (accessor.bufferView === undefined || accessor.sparse) throw Error('Unsupported native animation accessor');
    const key = JSON.stringify(accessor);
    let next = identical.get(key);
    if (next === undefined) { next = accessors.length; accessors.push(accessor); identical.set(key, next); }
    remap.set(index, next);
  });
  for (const clip of gltf.animations) for (const sampler of clip.samplers) {
    sampler.input = remap.get(sampler.input); sampler.output = remap.get(sampler.output);
  }
  for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remap.get(skin.inverseBindMatrices);
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.indices !== undefined) primitive.indices = remap.get(primitive.indices);
    for (const key of Object.keys(primitive.attributes ?? {})) primitive.attributes[key] = remap.get(primitive.attributes[key]);
    for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) target[key] = remap.get(target[key]);
  }
  const removed = gltf.accessors.length - accessors.length;
  gltf.accessors = accessors;
  const raw = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const result = Buffer.alloc(28 + json.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(result, 28 + json.length);
  return { bytes: result, removed };
}
