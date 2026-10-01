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
function homeIdleFixture(times = [0, 1, 1 + 1 / 60], duration = 1) {
  const binary = Buffer.alloc(times.length * 16);
  times.forEach((t, i) => binary.writeFloatLE(t, i * 4));
  const model = { asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: times.length * 4 }, { buffer: 0, byteOffset: times.length * 4, byteLength: times.length * 12 }], accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: times.length }, { bufferView: 1, componentType: 5126, type: 'VEC3', count: times.length }], animations: [{ name: 'HOME Idle', extras: { homeDuration: duration }, samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }], nodes: [{}] };
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
