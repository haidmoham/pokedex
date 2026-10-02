import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { readGlb, restoreOriginalHomeScene, writeGlb } from '../scripts/model-pipeline/restore-original-home-scene.mjs';

const sharp = createRequire(new URL('../scripts/model-pipeline/package.json', import.meta.url))('sharp');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const source = (layerUv = 1) => ({
  map: { path: 'base.png', wrap: [0, 1], repeat: [2, 1], offset: [0, 0] },
  layer: { path: 'layer.png', wrap: [2, 0], repeat: [1, 1], offset: [0, 0] },
  floats: { _ColorMapUvIndex: 0, _Layer1UvIndex: layerUv, _Layer1Enable: 1,
    _Layer1OverLerpValue: 1, _LayerCalcMulti: 0, _BlendMode: 0, _CullMode: 2,
    _ColorBaseU: -0.5, _ColorBaseV: 0, _Layer1BaseU: 0, _Layer1BaseV: 0 },
});

function fixtures({ merged = true, changedJoint = false, changedRest = false, originalUv1 = true } = {}) {
  const bin = Buffer.alloc(128);
  for (let i = 0; i < 4; i++) bin.writeFloatLE(1, i * 20 + 4 * i); // just deterministic source bytes
  const raw = {
    asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 64 }, { buffer: 0, byteOffset: 64, byteLength: 36 },
      { buffer: 0, byteOffset: 100, byteLength: 16 }, { buffer: 0, byteOffset: 116, byteLength: 8 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: 'MAT4' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 2, type: 'VEC2' },
      { bufferView: 3, componentType: 5126, count: 1, type: 'VEC2' }],
    materials: [{ name: 'BodyA' }, { name: 'BodyB' }],
    meshes: [{ name: 'BodyMesh', primitives: [
      { attributes: { POSITION: 1, TEXCOORD_0: 2, ...(originalUv1 ? { TEXCOORD_1: 2 } : {}) }, material: 0 },
      { attributes: { POSITION: 1, TEXCOORD_0: 2, ...(originalUv1 ? { TEXCOORD_1: 2 } : {}) }, material: 1 },
    ] }],
    skins: [{ joints: [1], inverseBindMatrices: 0 }],
    nodes: [{ name: 'Root', children: [1, 2] }, { name: 'Joint' }, { name: 'Body', mesh: 0, skin: 0 }],
    scenes: [{ nodes: [0] }], scene: 0,
  };
  const atlas = structuredClone(raw);
  atlas.materials = merged ? [{ name: 'BodyA' }] : structuredClone(raw.materials);
  atlas.meshes[0].primitives = [{ attributes: { POSITION: 1, TEXCOORD_0: 2 }, material: 0 }];
  if (changedJoint) atlas.skins[0].joints = [2];
  if (changedRest) atlas.nodes[1].rotation = [0, 0, 0.1, 0.99];
  atlas.animations = [{ name: 'HOME Idle', extras: { homeDuration: 1 },
    samplers: [{ input: 3, output: 1, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] }];
  return { rawBytes: writeGlb(raw, bin), atlasBytes: writeGlb(atlas, bin) };
}

test('restores original primitive/material identity and remaps native Idle by node identity', () => {
  const inputs = fixtures();
  const { bytes, metrics } = restoreOriginalHomeScene({ id: 467, ...inputs,
    sourceMaterials: { BodyA: source(), BodyB: source(0) },
    textureBytesByPath: { 'base.png': png, 'layer.png': png } });
  const result = readGlb(bytes).json;
  assert.deepEqual(result.meshes[0].primitives.map(primitive => result.materials[primitive.material].name), ['BodyA', 'BodyB']);
  assert.equal(result.animations[0].name, 'HOME Idle');
  assert.equal(result.animations[0].channels[0].target.node, 1);
  assert.equal(result.materials[0].extras.homeLayerUv.layer, 1);
  assert.equal(result.materials[1].extras.homeLayerUv, undefined);
  assert.equal(result.materials[1].extras.homeSourceTextures.layer.uv, 0);
  assert.deepEqual(result.materials[0].pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform,
    { offset: [-0.5, 0], scale: [2, 1], texCoord: 0 });
  assert.equal(metrics.originalPrimitiveCount, 2);
  assert.equal(metrics.admitted, false);
  assert.equal(metrics.published, false);
});

test('rejects skin/rest drift before importing native curves', () => {
  for (const changes of [{ changedJoint: true }, { changedRest: true }]) {
    assert.throws(() => restoreOriginalHomeScene({ id: 467, ...fixtures(changes),
      sourceMaterials: { BodyA: source(), BodyB: source() }, textureBytesByPath: { 'base.png': png, 'layer.png': png } }),
    /Changed (skin binding|local rest transform)/);
  }
});

test('never invents secondary UVs without source-specific proof', () => {
  assert.throws(() => restoreOriginalHomeScene({ id: 467, ...fixtures({ originalUv1: false }),
    sourceMaterials: { BodyA: source(), BodyB: source() }, textureBytesByPath: { 'base.png': png, 'layer.png': png } }),
  /Missing original secondary UV without source-default proof/);
});

test('rejects absent original source texture rather than replacing it with Atlas color', () => {
  assert.throws(() => restoreOriginalHomeScene({ id: 467, ...fixtures(),
    sourceMaterials: { BodyA: source(), BodyB: source() }, textureBytesByPath: { 'base.png': png } }),
  /Missing pinned PNG/);
});

test('accepts only the source-defined exact-name black additive special material', () => {
  const initial = fixtures(), raw = readGlb(initial.rawBytes), atlas = readGlb(initial.atlasBytes);
  const name = 'pm0990_00_00-BodyATra';
  raw.json.materials = [{ name }];
  raw.json.meshes[0].primitives.forEach(primitive => { primitive.material = 0; });
  atlas.json.materials = [{ name, extras: { homeBlend: 'additive' }, alphaMode: 'BLEND',
    pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 0], metallicFactor: 0 } }];
  const sourceMaterials = { [name]: { floats: { _BlendMode: 2, _SrcBlend: 5, _DstBlend: 1 },
    colors: { _ConstantColor0: { r: 0, g: 0, b: 0, a: 1 } } } };
  const input = { id: 990, rawBytes: writeGlb(raw.json, raw.binary), atlasBytes: writeGlb(atlas.json, atlas.binary),
    sourceMaterials, textureBytesByPath: {} };
  const output = readGlb(restoreOriginalHomeScene(input).bytes).json;
  assert.deepEqual(output.materials[0].pbrMetallicRoughness.baseColorFactor, [0, 0, 0, 0]);
  assert.equal(output.materials[0].extras.homeBlend, 'additive');
  assert.equal(output.materials[0].extras.homeSpecialMaterial.mode, 'constant-additive');
  assert.equal(output.materials[0].pbrMetallicRoughness.baseColorTexture, undefined);
  sourceMaterials[name].floats._DstBlend = 10;
  assert.throws(() => restoreOriginalHomeScene(input), /Unverified source constant additive/);
  sourceMaterials[name].floats._DstBlend = 1;
  raw.json.materials[0].name = 'another-material';
  assert.throws(() => restoreOriginalHomeScene({ ...input, rawBytes: writeGlb(raw.json, raw.binary),
    sourceMaterials: { 'another-material': sourceMaterials[name] } }), /Unapproved untextured source material/);
});

test('copies exact pinned Atlas fire core/mask textures under source stencil guards', async () => {
  const initial = fixtures(), raw = readGlb(initial.rawBytes), atlas = readGlb(initial.atlasBytes);
  const core = 'pm0126_00_00-FireCore', mask = 'pm0126_00_00-FireMask';
  raw.json.materials = [{ name: core }, { name: mask }];
  const webp = await sharp({ create: { width: 2, height: 2, channels: 4,
    background: { r: 255, g: 120, b: 0, alpha: 1 } } }).webp().toBuffer();
  const binary = Buffer.concat([atlas.binary, webp]);
  atlas.json.buffers[0].byteLength = binary.length;
  atlas.json.bufferViews.push({ buffer: 0, byteOffset: atlas.binary.length, byteLength: webp.length });
  atlas.json.images = [{ bufferView: atlas.json.bufferViews.length - 1, mimeType: 'image/webp' }];
  atlas.json.samplers = [{ wrapS: 10497, wrapT: 10497 }];
  atlas.json.textures = [{ sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } }];
  atlas.json.materials = [
    { name: core, extras: { homeStencil: { role: 'core', ref: 1 } },
      pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1] }, emissiveTexture: { index: 0 } },
    { name: mask, extras: { homeStencil: { role: 'mask', ref: 1 } }, alphaMode: 'MASK',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
  ];
  const slot = { path: 'pinned-mask.png' };
  const sourceMaterials = {
    [core]: { blend0: slot, blend1: slot, lerp: slot, floats: { _SrcBlend: 1, _DstBlend: 0 } },
    [mask]: { mask0: slot, mask1: slot, floats: { _SrcBlend: 1, _DstBlend: 0,
      MASK_FIRST_UV: 0, MASK_SECOND_UV: 0 } },
  };
  const input = { id: 126, rawBytes: writeGlb(raw.json, raw.binary), atlasBytes: writeGlb(atlas.json, binary),
    sourceMaterials, textureBytesByPath: {} };
  const output = readGlb(restoreOriginalHomeScene(input).bytes);
  assert.equal(output.json.materials[0].extras.homeSpecialMaterial.mode, 'core');
  assert.equal(output.json.materials[1].extras.homeSpecialMaterial.mode, 'mask');
  assert.equal(output.json.materials[0].emissiveTexture.index, 0);
  assert.equal(output.json.materials[1].pbrMetallicRoughness.baseColorTexture.index, 0);
  assert.deepEqual(output.json.extensionsRequired, ['EXT_texture_webp']);
  const imageView = output.json.bufferViews[output.json.images[0].bufferView];
  assert.deepEqual(output.binary.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength), webp);
  delete sourceMaterials[core].blend1;
  assert.throws(() => restoreOriginalHomeScene(input), /Unverified source fire core/);
});
