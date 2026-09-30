import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/trail-model.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { extendTrail, traverseTrail } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const step = index => ({ visit: { speciesId: index + 1, ids: [`card-${index}`], selectedId: `card-${index}` }, context: `Artist ${index}` });

test('ten deliberate discoveries reverse and replay the exact card and context sequence', () => {
  let path = null;
  for (let index = 1; index <= 10; index++) path = extendTrail(path, step(0), step(index), { artist: `Artist ${index}`, speciesId: index + 1, phase: 'artist', offset: 0, position: 0 });
  const expected = path.steps.map(item => [item.visit.selectedId, item.context]);
  assert.equal(path.index, 10);
  for (let index = 9; index >= 0; index--) {
    path = traverseTrail(path, -1);
    assert.deepEqual([path.steps[path.index].visit.selectedId, path.steps[path.index].context], expected[index]);
  }
  assert.equal(traverseTrail(path, -1), path);
  for (let index = 1; index <= 10; index++) {
    path = traverseTrail(path, 1);
    assert.deepEqual([path.steps[path.index].visit.selectedId, path.steps[path.index].context], expected[index]);
  }
  assert.equal(traverseTrail(path, 1), path);
});

test('newly prepared results extend only after the visited prefix', () => {
  let path = extendTrail(null, step(0), step(1), null);
  const first = path.steps[0];
  path = extendTrail(path, step(999), step(2), null);
  assert.equal(path.steps[0], first);
  assert.deepEqual(path.steps.map(item => item.visit.selectedId), ['card-0', 'card-1', 'card-2']);
});
