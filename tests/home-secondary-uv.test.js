import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { restoreHomeSecondaryUv } from '../scripts/model-pipeline/restore-home-secondary-uv.mjs';

const requirePipeline = createRequire(new URL('../scripts/model-pipeline/package.json', import.meta.url));
const { Document, NodeIO } = requirePipeline('@gltf-transform/core');
const { ALL_EXTENSIONS } = requirePipeline('@gltf-transform/extensions');
const draco = requirePipeline('draco3dgltf');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco.createDecoderModule(),
});

async function fixture({ secondaryUv = false, duplicate = false, translation = 0 } = {}) {
  const doc = new Document(), buffer = doc.createBuffer();
  const accessor = (name, type, array) => doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  const position = accessor('position', 'VEC3', new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]));
  const normal = accessor('normal', 'VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const uv0 = accessor('uv0', 'VEC2', new Float32Array([0, 0, 1, 0, 0.5, 1]));
  const uv1 = accessor('uv1', 'VEC2', new Float32Array([0.2, 0.1, 0.8, 0.1, 0.5, 0.9]));
  const indices = accessor('indices', 'SCALAR', new Uint16Array([0, 1, 2]));
  const material = doc.createMaterial('exact-material');
  const mesh = doc.createMesh('exact-mesh');
  const addPrimitive = () => {
    const primitive = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('NORMAL', normal)
      .setAttribute('TEXCOORD_0', uv0).setIndices(indices).setMaterial(material);
    if (secondaryUv) primitive.setAttribute('TEXCOORD_1', uv1);
    mesh.addPrimitive(primitive);
  };
  addPrimitive(); if (duplicate) addPrimitive();
  const node = doc.createNode('exact-node').setMesh(mesh).setTranslation([translation, 0, 0]);
  const scene = doc.createScene('scene').addChild(node); doc.getRoot().setDefaultScene(scene);
  const input = accessor('times', 'SCALAR', new Float32Array([0, 1]));
  const output = accessor('motion', 'VEC3', new Float32Array([0, 0, 0, 0.25, 0, 0]));
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setSampler(sampler).setTargetNode(node).setTargetPath('translation');
  doc.createAnimation('HOME Idle').setExtras({ homeDuration: 1 }).addSampler(sampler).addChannel(channel);
  return Buffer.from(await io.writeBinary(doc));
}

test('raw primitive replacement restores UV1 while keeping exact native idle values', async () => {
  const atlas = await fixture(), original = await fixture({ secondaryUv: true });
  const result = await restoreHomeSecondaryUv(atlas, original, ['exact-material']);
  const decoded = await io.readBinary(result.bytes);
  const primitive = decoded.getRoot().listMeshes()[0].listPrimitives()[0];
  assert.ok(primitive.getAttribute('TEXCOORD_1'));
  assert.equal(primitive.getAttribute('TEXCOORD_1').getCount(), primitive.getAttribute('POSITION').getCount());
  assert.equal(result.metrics.nativeAnimationPreserved, true);
  assert.equal(result.metrics.unrelatedSceneMaterialTextureValuesPreserved, true);
  assert.equal(result.metrics.transferBudgetPass, true);
  assert.match(result.metrics.derivativeSha256, /^[a-f0-9]{64}$/);
});

test('no guessed UVs for absent raw channel, merged primitives or changed rig binding', async () => {
  const atlas = await fixture(), original = await fixture({ secondaryUv: true });
  await assert.rejects(restoreHomeSecondaryUv(atlas, await fixture(), ['exact-material']), /secondary UV unavailable/);
  await assert.rejects(restoreHomeSecondaryUv(await fixture({ duplicate: true }), original, ['exact-material']), /Ambiguous original primitive/);
  await assert.rejects(restoreHomeSecondaryUv(atlas, await fixture({ secondaryUv: true, translation: 1 }), ['exact-material']), /rig binding changed/);
});

test('affected material names are exact, unique and bounded', async () => {
  const atlas = await fixture(), original = await fixture({ secondaryUv: true });
  await assert.rejects(restoreHomeSecondaryUv(atlas, original, ['wrong-material']), /Affected material absent/);
  await assert.rejects(restoreHomeSecondaryUv(atlas, original, ['exact-material', 'exact-material']), /Exact affected material names/);
});
