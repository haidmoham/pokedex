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
