// Data-only GLB edit: keep original compressed geometry, images and skeletal values.
// HOME's guard frame is not part of the documented loop duration.
export function trimHomeIdle(bytes, { normalizeZeroAdditive = false } = {}) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB');
  const jsonLength = bytes.readUInt32LE(12), binaryHeader = 20 + jsonLength;
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942) throw new Error('Invalid GLB chunks');
  const model = JSON.parse(bytes.subarray(20, binaryHeader).toString());
  const binary = bytes.subarray(binaryHeader + 8);
  let normalizedMaterials = 0;
  if (normalizeZeroAdditive) {
    // Atlas applies ordinary THREE.AdditiveBlending to these placeholders.
    // Black, untextured, non-emissive, non-specular surfaces add exactly zero.
    // Encode that no-op as standard alpha zero; never approximate lit effects.
    for (const material of model.materials ?? []) {
      if (material.extras?.homeStencil) throw new Error('Stencil repair unsupported');
      if (material.extras?.homeBlend !== 'additive') continue;
      const pbr = material.pbrMetallicRoughness ?? {}, factor = pbr.baseColorFactor;
      const extensions = material.extensions ?? {};
      if (!Array.isArray(factor) || factor.length !== 4 || factor.slice(0, 3).some(v => v !== 0)
        || ![0, 1].includes(factor[3]) || pbr.baseColorTexture || pbr.metallicRoughnessTexture
        || pbr.metallicFactor !== 0 || material.emissiveTexture || material.normalTexture
        || (material.emissiveFactor ?? [0, 0, 0]).some(v => v !== 0)
        || Object.keys(extensions).some(k => k !== 'KHR_materials_specular')
        || extensions.KHR_materials_specular?.specularFactor !== 0
        || extensions.KHR_materials_specular?.specularTexture
        || extensions.KHR_materials_specular?.specularColorTexture) throw new Error('Nonzero additive effect requires its own renderer');
      material.alphaMode = 'BLEND';
      material.pbrMetallicRoughness.baseColorFactor = [0, 0, 0, 0];
      delete material.extras.homeBlend;
      if (!Object.keys(material.extras).length) delete material.extras;
      normalizedMaterials++;
    }
    if (!normalizedMaterials) throw new Error('Expected zero additive placeholder');
  }
  if (model.animations?.length !== 1) throw new Error('Expected one HOME idle');
  const animation = model.animations[0], duration = animation.extras?.homeDuration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30) throw new Error('Invalid HOME loop duration');
  let removedGuardKeys = 0;
  for (const sampler of animation.samplers) {
    const input = model.accessors[sampler.input], output = model.accessors[sampler.output];
    if (input.componentType !== 5126 || input.type !== 'SCALAR' || input.sparse || output.sparse) throw new Error('Unsupported animation accessor');
    const view = model.bufferViews[input.bufferView];
    if (view.extensions || view.buffer !== 0) throw new Error('Unsupported animation buffer');
    const offset = (view.byteOffset ?? 0) + (input.byteOffset ?? 0), stride = view.byteStride ?? 4;
    const times = Array.from({ length: input.count }, (_, i) => binary.readFloatLE(offset + i * stride));
    if (times.some((t, i) => !Number.isFinite(t) || t < 0 || (i > 0 && t <= times[i - 1]))) throw new Error('Invalid animation times');
    const end = times.findIndex(t => Math.abs(t - duration) < 1e-6);
    if (end < 0 || times.slice(end + 1).some(t => t - duration > 0.05)) throw new Error('Exact HOME endpoint missing or unexpected tail');
    const factor = sampler.interpolation === 'CUBICSPLINE' ? 3 : 1;
    if (output.count !== input.count * factor) throw new Error('Invalid animation sample count');
    sampler.input = model.accessors.length;
    model.accessors.push({ ...input, count: end + 1, min: [times[0]], max: [times[end]] });
    sampler.output = model.accessors.length;
    const retained = { ...output, count: (end + 1) * factor };
    delete retained.min; delete retained.max;
    model.accessors.push(retained);
    removedGuardKeys += input.count - end - 1;
  }
  // Drop obsolete accessors so admission counts only referenced data. Buffer bytes
  // stay identical; this is metadata compaction, not recompression or simplification.
  const used = new Set();
  for (const mesh of model.meshes ?? []) for (const p of mesh.primitives) {
    Object.values(p.attributes).forEach(i => used.add(i));
    if (p.indices !== undefined) used.add(p.indices);
    for (const target of p.targets ?? []) Object.values(target).forEach(i => used.add(i));
  }
  for (const skin of model.skins ?? []) if (skin.inverseBindMatrices !== undefined) used.add(skin.inverseBindMatrices);
  for (const a of model.animations) for (const s of a.samplers) { used.add(s.input); used.add(s.output); }
  const indices = [...used].sort((a, b) => a - b), remap = new Map(indices.map((old, i) => [old, i]));
  for (const mesh of model.meshes ?? []) for (const p of mesh.primitives) {
    for (const key of Object.keys(p.attributes)) p.attributes[key] = remap.get(p.attributes[key]);
    if (p.indices !== undefined) p.indices = remap.get(p.indices);
    for (const target of p.targets ?? []) for (const key of Object.keys(target)) target[key] = remap.get(target[key]);
  }
  for (const skin of model.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remap.get(skin.inverseBindMatrices);
  for (const a of model.animations) for (const s of a.samplers) { s.input = remap.get(s.input); s.output = remap.get(s.output); }
  model.accessors = indices.map(i => model.accessors[i]);
  const raw = Buffer.from(JSON.stringify(model)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const result = Buffer.alloc(28 + json.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(result, 28 + json.length);
  return { bytes: result, duration, removedGuardKeys, animation: animation.name, normalizedMaterials };
}
