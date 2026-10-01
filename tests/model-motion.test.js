import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/model-motion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { prepareIdle, idleMayPlay, sampleIdlePose, IDLE_POSE_PHASES } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('idle pose sampling waits for reactive clip selection rather than being reset to bind pose', async () => {
  const calls = [];
  let settle;
  const viewer = { animationName: undefined, updateComplete: new Promise(resolve => { settle = resolve; }), availableAnimations: ['idle'], duration: 3, currentTime: 0, timeScale: 1, play() { calls.push('play'); }, pause() { calls.push('pause'); } };
  const prepared = prepareIdle(viewer, 'idle', new AbortController().signal);
  assert.equal(viewer.animationName, 'idle');
  assert.deepEqual(calls, []);
  settle();
  assert.equal(await prepared, true);
  assert.deepEqual(calls, ['play', 'pause']);
  assert.equal(viewer.currentTime, 0.35);
  assert.equal(viewer.timeScale, 0.6);
});

test('departed models and missing approved clips do not start playback', async () => {
  let calls = 0;
  const viewer = { animationName: undefined, updateComplete: Promise.resolve(), availableAnimations: [], duration: 3, currentTime: 0, timeScale: 1, play() { calls++; }, pause() {} };
  const controller = new AbortController(); controller.abort();
  assert.equal(await prepareIdle(viewer, 'idle', controller.signal), false);
  await assert.rejects(prepareIdle(viewer, 'idle', new AbortController().signal), /idle is unavailable/);
  assert.equal(calls, 0);
});

test('idle respects explicit pause, open panels, hidden tabs and reduced motion', () => {
  assert.equal(idleMayPlay(true, false, false, false), true);
  for (const flags of [[false,false,false,false],[true,true,false,false],[true,false,true,false],[true,false,false,true]]) assert.equal(idleMayPlay(...flags), false);
});

test('clip presence does not admit zero, negative or nonfinite idle durations', async () => {
  for (const duration of [0, -1, NaN, Infinity]) {
    let played = false;
    const viewer = { animationName: undefined, updateComplete: Promise.resolve(), availableAnimations: ['idle'], duration, currentTime: 0, timeScale: 1, play() { played = true; }, pause() {} };
    await assert.rejects(prepareIdle(viewer, 'idle', new AbortController().signal), /usable duration/);
    assert.equal(played, false);
  }
});


test('three still poses sample distinct positions in the real idle and pause playback', () => {
  const viewer = {duration: 4, currentTime: 0, pauses: 0, pause() { this.pauses++; }};
  const times = IDLE_POSE_PHASES.map((_, pose) => { sampleIdlePose(viewer, pose); return viewer.currentTime; });
  assert.deepEqual(times, [0.5, 1.5, 2.5]);
  assert.equal(viewer.pauses, 3);
});

test('pose selection rejects unknown indices and unusable clip duration', () => {
  for (const pose of [-1, 3, 0.5, NaN]) assert.throws(() => sampleIdlePose({duration: 4, currentTime: 0, pause() {}}, pose), /Unknown idle pose/);
  for (const duration of [0, -1, Infinity, NaN]) assert.throws(() => sampleIdlePose({duration, currentTime: 0, pause() {}}, 0), /usable duration/);
});

// Requested native-idle loop checks for the preview source's extra guard frame.
import { trimHomeIdle } from '../scripts/trim-home-idle.js';
function homeIdleFixture(times = [0, 1, 1 + 1 / 60], duration = 1, materials = [], interpolation = 'LINEAR') {
  const factor = interpolation === 'CUBICSPLINE' ? 3 : 1;
  const binary = Buffer.alloc(times.length * (4 + 12 * factor));
  times.forEach((t, i) => binary.writeFloatLE(t, i * 4));
  const model = { asset: { version: '2.0' }, materials, buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: times.length * 4 }, { buffer: 0, byteOffset: times.length * 4, byteLength: times.length * 12 * factor }], accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: times.length }, { bufferView: 1, componentType: 5126, type: 'VEC3', count: times.length * factor }], animations: [{ name: 'HOME Idle', extras: { homeDuration: duration }, samplers: [{ input: 0, output: 1, interpolation }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }], nodes: [{}] };
  const json = Buffer.from(JSON.stringify(model)); const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const result = Buffer.alloc(28 + padded.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8); result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20); result.writeUInt32LE(binary.length, 20 + padded.length); result.writeUInt32LE(0x004e4942, 24 + padded.length); binary.copy(result, 28 + padded.length);
  return result;
}
test('native HOME idle stops at its exact source endpoint without rewriting binary pose data', () => {
  const source = homeIdleFixture(); const result = trimHomeIdle(source);
  assert.equal(result.duration, 1); assert.equal(result.removedGuardKeys, 1);
  const jsonEnd = 20 + result.bytes.readUInt32LE(12);
  const model = JSON.parse(result.bytes.subarray(20, jsonEnd).toString());
  assert.equal(model.accessors[model.animations[0].samplers[0].input].count, 2);
  assert.deepEqual(result.bytes.subarray(jsonEnd + 8), source.subarray(28 + source.readUInt32LE(12)));
});
test('idle preparation refuses to invent a missing endpoint or silently discard a long clip tail', () => {
  assert.throws(() => trimHomeIdle(homeIdleFixture([0, 0.5, 1.016])), /endpoint/);
  assert.throws(() => trimHomeIdle(homeIdleFixture([0, 1, 1.2])), /tail/);
  assert.throws(() => trimHomeIdle(homeIdleFixture([0, 1], 0)), /duration/);
});

function zeroAdditiveFixture() {
  return { extras: { homeBlend: 'additive' }, alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0 }, extensions: { KHR_materials_specular: { specularFactor: 0 } } };
}
test('idle material normalization preserves every binary pose value and makes only zero-light placeholders transparent', () => {
  const source = homeIdleFixture(undefined, 1, [zeroAdditiveFixture()]);
  const result = trimHomeIdle(source, { normalizeZeroAdditive: true });
  const end = 20 + result.bytes.readUInt32LE(12);
  const model = JSON.parse(result.bytes.subarray(20, end));
  assert.deepEqual(result.bytes.subarray(end + 8), source.subarray(28 + source.readUInt32LE(12)));
  assert.equal(result.normalizedMaterials, 1);
  assert.deepEqual(model.materials[0].pbrMetallicRoughness.baseColorFactor, [0, 0, 0, 0]);
  assert.equal(model.materials[0].extras, undefined);
  assert.equal(model.animations[0].channels.length, 1);
  const invisible = zeroAdditiveFixture(); invisible.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 0];
  invisible.pbrMetallicRoughness.baseColorTexture = { index: 0 }; invisible.emissiveFactor = [1, 1, 1];
  const transparentSource = homeIdleFixture(undefined, 1, [invisible]);
  const transparent = trimHomeIdle(transparentSource, { normalizeZeroAdditive: true });
  assert.equal(transparent.normalizedMaterials, 1);
  assert.deepEqual(transparent.bytes.subarray(28 + transparent.bytes.readUInt32LE(12)), transparentSource.subarray(28 + transparentSource.readUInt32LE(12)));
});
test('idle material normalization refuses colored, textured, emissive or stencil effects', () => {
  for (const change of [m => { m.pbrMetallicRoughness.baseColorFactor[0] = 1; }, m => { m.pbrMetallicRoughness.baseColorTexture = { index: 0 }; }, m => { m.emissiveFactor = [1, 0, 0]; }, m => { m.extras.homeStencil = { role: 'core', ref: 1 }; }]) {
    const material = zeroAdditiveFixture(); change(material);
    assert.throws(() => trimHomeIdle(homeIdleFixture(undefined, 1, [material]), { normalizeZeroAdditive: true }), /effect|Stencil/);
  }
});

import { compressHomeAnimation } from '../scripts/compress-home-animation.js';
import { MeshoptDecoder as RuntimeMeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
test('lossless native idle compression decodes every linear and cubic pose value with the production decoder', async () => {
  await RuntimeMeshoptDecoder.ready;
  for (const interpolation of ['LINEAR', 'CUBICSPLINE']) {
    const original = homeIdleFixture(undefined, 1, [], interpolation);
    const binaryStart = 28 + original.readUInt32LE(12);
    for (let offset = binaryStart + 12, k = 0; offset < original.length; offset += 4, k++) original.writeFloatLE(Math.sin(k * 0.3), offset);
    const source = trimHomeIdle(original).bytes, prepared = await compressHomeAnimation(source);
    const before = JSON.parse(source.subarray(20, 20 + source.readUInt32LE(12)));
    const after = JSON.parse(prepared.subarray(20, 20 + prepared.readUInt32LE(12)));
    assert.deepEqual(after.animations, before.animations);
    const sourceBinary = source.subarray(28 + source.readUInt32LE(12));
    const preparedBinary = prepared.subarray(28 + prepared.readUInt32LE(12));
    const decoded = new Map();
    for (let i = 0; i < after.accessors.length; i++) {
      const a = before.accessors[i], b = after.accessors[i], v = before.bufferViews[a.bufferView];
      const view = after.bufferViews[b.bufferView], compression = view.extensions.EXT_meshopt_compression;
      if (!decoded.has(b.bufferView)) {
        const output = new Uint8Array(view.byteLength);
        RuntimeMeshoptDecoder.decodeGltfBuffer(output, compression.count, compression.byteStride, preparedBinary.subarray(compression.byteOffset, compression.byteOffset + compression.byteLength), compression.mode, compression.filter);
        decoded.set(b.bufferView, Buffer.from(output));
      }
      const length = a.count * (a.type === 'SCALAR' ? 4 : 12);
      const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
      assert.deepEqual(decoded.get(b.bufferView).subarray(b.byteOffset, b.byteOffset + length), sourceBinary.subarray(start, start + length));
    }
  }
});

import { selectCatalogIdle, reviewedCatalogSource } from '../scripts/select-catalog-idle.js';
function namedCatalogFixture(names) {
  const original = homeIdleFixture([0, 1], 1);
  const end = 20 + original.readUInt32LE(12);
  const model = JSON.parse(original.subarray(20, end));
  model.animations = names.map(name => ({ ...structuredClone(model.animations[0]), name }));
  const raw = Buffer.from(JSON.stringify(model));
  const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json);
  const binary = original.subarray(end + 8);
  const result = Buffer.alloc(28 + json.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12); result.writeUInt32LE(0x4e4f534a, 16); json.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + json.length); result.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(result, 28 + json.length);
  return result;
}
test('catalog selection retains an exact native wait clip and lossless accessor values', () => {
  const name = 'pm1095_00_00_00000_defaultwait01_loop';
  const original = namedCatalogFixture(['attack', name]);
  const before = JSON.parse(original.subarray(20, 20 + original.readUInt32LE(12)));
  const output = selectCatalogIdle(original, name).bytes;
  const after = JSON.parse(output.subarray(20, 20 + output.readUInt32LE(12)));
  assert.equal(after.animations.length, 1);
  assert.equal(after.animations[0].name, name);
  assert.deepEqual(after.animations[0].channels, before.animations[1].channels);
  for (const key of ['input', 'output']) {
    const read = (bytes, model, animation) => {
      const accessor = model.accessors[animation.samplers[0][key]], view = model.bufferViews[accessor.bufferView];
      const start = 28 + bytes.readUInt32LE(12) + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      return bytes.subarray(start, start + accessor.count * (accessor.type === 'SCALAR' ? 4 : 12));
    };
    assert.deepEqual(read(output, after, after.animations[0]), read(original, before, before.animations[1]));
  }
});
test('catalog selection rejects missing, ambiguous, or arbitrarily relabeled motion', () => {
  const name = 'pm1095_00_00_00000_defaultwait01_loop';
  assert.throws(() => selectCatalogIdle(namedCatalogFixture(['attack']), name), /Ambiguous/);
  assert.throws(() => selectCatalogIdle(namedCatalogFixture([name, name]), name), /Ambiguous/);
  assert.throws(() => selectCatalogIdle(namedCatalogFixture(['attack']), 'attack'), /Invalid native idle/);
  assert.throws(() => selectCatalogIdle(Buffer.alloc(20), name), /Invalid bounded/);
});
test('catalog source exception is limited to exact reviewed immutable identities', () => {
  const asset = { id: 995, preparation: 'catalog-native-idle', animation: 'pm1095_00_00_00000_defaultwait01_loop', sourceArtifact: { url: 'https://raw.githubusercontent.com/Pokemon-3D-api/assets/429de1288cea0d43f5b4f56305d2276e94239d65/models/opt/regular/995.glb', bytes: 2914604, sha256: '0732b261a555c62bbdedcd77374f64e6fad4ce4d6a14ce1ab05ef2c5e61791ef' } };
  assert.equal(reviewedCatalogSource(asset).bytes, 2914604);
  for (const change of [{ id: 1 }, { animation: 'attack' }, { preparation: undefined }, { materialRepair: 'zero-additive-to-transparent' }, { sourceArtifact: { ...asset.sourceArtifact, sha256: '0'.repeat(64) } }, { sourceArtifact: { ...asset.sourceArtifact, url: asset.sourceArtifact.url.replace('429de1288cea0d43f5b4f56305d2276e94239d65', 'main') } }]) assert.throws(() => reviewedCatalogSource({ ...asset, ...change }), /Unreviewed/);
});


test('catalog selection rejects corrupt binary chunk headers before repacking', () => {
  const name = 'pm1095_00_00_00000_defaultwait01_loop';
  const source = namedCatalogFixture([name]);
  source.writeUInt32LE(0, 24 + source.readUInt32LE(12));
  assert.throws(() => selectCatalogIdle(source, name), /Invalid catalog chunks/);
});
