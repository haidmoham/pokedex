import { compactGlbViews } from './compact-catalog-views.js';

// The caller accepts only Yveltal's individually reviewed pinned source SHA256.
// Its two ordinary-additive effects have source alpha zero at every instant.
// Removing their exclusively used maps cannot change their zero contribution.
export function pruneYveltalZeroAlphaTextures(bytes) {
  if (bytes.length < 28 || bytes.length > 1500000 || bytes.readUInt32LE(0) !== 0x46546c67 ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid bounded GLB');
  const size = bytes.readUInt32LE(12), end = 20 + size;
  if (end + 8 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(end + 4) !== 0x004e4942) throw Error('Invalid GLB chunks');
  const model = JSON.parse(bytes.subarray(20, end)), binary = bytes.subarray(end + 8);
  const names = new Set(['pm0717_00_00-EffB', 'pm0717_00_00-EffC']);
  for (const material of model.materials ?? []) {
    if (!names.has(material.name)) continue;
    if (material.alphaMode !== 'BLEND' || material.pbrMetallicRoughness?.baseColorFactor?.[3] !== 0 ||
        material.extras?.homeBlend || material.extras?.homeStencil) throw Error('Effect is not normalized source-zero alpha');
    names.delete(material.name);
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    material.pbrMetallicRoughness.baseColorFactor = [0, 0, 0, 0];
    material.emissiveFactor = [0, 0, 0];
  }
  if (names.size) throw Error('Expected two reviewed zero-alpha effects');
  const references = [];
  const collect = object => {
    if (!object || typeof object !== 'object') return;
    for (const [key, value] of Object.entries(object)) {
      if (key.endsWith('Texture') && value && Number.isInteger(value.index)) references.push(value);
      else collect(value);
    }
  };
  model.materials.forEach(collect);
  const needed = [...new Set(references.map(value => value.index))].sort((a, b) => a - b);
  const remap = new Map(needed.map((old, index) => [old, index]));
  for (const reference of references) reference.index = remap.get(reference.index);
  model.textures = needed.map(index => model.textures[index]);
  const imageReferences = [];
  for (const texture of model.textures) {
    if (Number.isInteger(texture.source)) imageReferences.push(texture);
    for (const extension of Object.values(texture.extensions ?? {})) if (Number.isInteger(extension.source)) imageReferences.push(extension);
  }
  const images = [...new Set(imageReferences.map(value => value.source))].sort((a, b) => a - b);
  const imageMap = new Map(images.map((old, index) => [old, index]));
  for (const reference of imageReferences) reference.source = imageMap.get(reference.source);
  model.images = images.map(index => model.images[index]);
  const raw = Buffer.from(JSON.stringify(model)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32);
  raw.copy(json);
  const result = Buffer.alloc(28 + json.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(result, 28 + json.length);
  return compactGlbViews(result);
}
