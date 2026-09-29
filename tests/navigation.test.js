import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the dependency-free navigation module so tests also run on Node 20.
const source = await readFile(new URL('../src/navigation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { classifyGesture, WheelGesture, wrapIndex, PointerGesture } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('each swipe selects one dominant axis and direction', () => {
  assert.deepEqual(classifyGesture(80, 20), { axis: 'x', direction: 1 });
  assert.deepEqual(classifyGesture(-80, 20), { axis: 'x', direction: -1 });
  assert.deepEqual(classifyGesture(20, 80), { axis: 'y', direction: 1 });
  assert.deepEqual(classifyGesture(20, -80), { axis: 'y', direction: -1 });
  assert.equal(classifyGesture(60, 60), null);
  assert.equal(classifyGesture(10, 10), null);
});

test('trackpad micro-deltas accumulate and momentum cannot change a second axis', () => {
  const wheel = new WheelGesture();
  assert.equal(wheel.read(12, 1, 0), null);
  assert.equal(wheel.read(12, 1, 16), null);
  assert.equal(wheel.read(12, 1, 32), null);
  assert.deepEqual(wheel.read(12, 1, 48), { axis: 'x', direction: 1 });
  for (let time = 64; time < 1000; time += 16) assert.equal(wheel.read(0, 70, time), null);
  assert.deepEqual(wheel.read(0, 70, 1200), { axis: 'y', direction: 1 });
});

test('repeated separate wheel gestures work and cancellation clears partial input', () => {
  const wheel = new WheelGesture();
  for (let time = 0; time < 2000; time += 250) {
    assert.deepEqual(wheel.read(0, -80, time), { axis: 'y', direction: -1 });
  }
  wheel.reset();
  assert.equal(wheel.read(20, 0, 2200), null);
  wheel.reset();
  assert.equal(wheel.read(20, 0, 2201), null);
});

test('cancelled, interrupted, and unrelated pointers cannot navigate', () => {
  const pointer = new PointerGesture();
  pointer.start(1, 100, 100);
  pointer.cancel();
  assert.equal(pointer.end(1, 0, 100), null);
  pointer.start(2, 100, 100);
  assert.equal(pointer.end(3, 0, 100), null);
  assert.deepEqual(pointer.end(2, 0, 100), { axis: 'x', direction: 1 });
  assert.equal(pointer.end(2, 0, 100), null);
  pointer.start(4, 100, 100);
  assert.deepEqual(pointer.end(4, 100, 0), { axis: 'y', direction: 1 });
});

test('card and species wrapping stays in range through repeated and reverse flows', () => {
  for (const length of [0, 1, 2, 4, 19]) {
    let index = 0;
    for (let count = 0; count < 200; count++) {
      index = wrapIndex(index, 1, length);
      assert.ok(index >= 0 && index < Math.max(length, 1));
    }
    for (let count = 0; count < 200; count++) index = wrapIndex(index, -1, length);
    assert.equal(index, 0);
  }
});


test('artist vertical momentum updates timing without blocking native scroll', () => {
  const wheel = new WheelGesture();
  assert.deepEqual(wheel.handle(50, 0, 0, false), {
    navigation: { axis: 'x', direction: 1 }, preventDefault: true,
  });
  for (let time = 16; time <= 208; time += 16) {
    assert.deepEqual(wheel.handle(0, 50, time, false), { navigation: null, preventDefault: false });
  }
  assert.deepEqual(wheel.handle(50, 0, 224, false), { navigation: null, preventDefault: true });
  assert.deepEqual(wheel.handle(50, 0, 500, false).navigation, { axis: 'x', direction: 1 });
});

test('museum vertical wheel has its own axis while artist vertical wheel scrolls', () => {
  assert.deepEqual(new WheelGesture().handle(0, 80, 0, true), {
    navigation: { axis: 'y', direction: 1 }, preventDefault: true,
  });
  assert.deepEqual(new WheelGesture().handle(0, 80, 0, false), {
    navigation: null, preventDefault: false,
  });
});
