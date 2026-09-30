import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const feed = compile(await readFile(new URL('../src/feed-model.ts', import.meta.url), 'utf8'));
const feedURL = `data:text/javascript;base64,${Buffer.from(feed).toString('base64')}`;
const visit = compile(await readFile(new URL('../src/visit-model.ts', import.meta.url), 'utf8')).replace("from './feed-model'", `from '${feedURL}'`).replace("import { modelEdition } from './model-policy';", 'const modelEdition = () => undefined;');
const { createVisit, prepareVisits, appendVisit, selectVisit, stepVisit } = await import(`data:text/javascript;base64,${Buffer.from(visit).toString('base64')}`);
const species = JSON.parse(await readFile(new URL('../content/species.json', import.meta.url), 'utf8'))[0];
const priced = (cardId, amount, updatedAt = new Date().toISOString()) => ({ cardId, pokemonId: 1, prices: [{ amount, currency: 'USD', updatedAt }] });

test('a deliberate entry starts with official art then the eligible price lead and explicit card target wins', () => {
  const available = [priced('cheap', 10), priced('high', 100), priced('stale', 900, '2020-01-01T00:00:00Z')];
  const visit = createVisit(species, available, 'USD');
  assert.deepEqual(visit.ids, ['official-1', 'high', 'cheap', 'stale']);
  assert.equal(visit.selectedId, 'official-1');
  assert.equal(createVisit(species, available, 'USD', 'cheap').selectedId, 'cheap');
});

test('async enrichment can append but cannot change selection, known order or known indices', () => {
  const first = createVisit(species, [priced('a', 10), priced('b', 5)], 'USD');
  const selected = selectVisit(first, 'b');
  const later = appendVisit(selected, [priced('a', 200), priced('b', 5), priced('new', 999)]);
  assert.equal(later.selectedId, 'b');
  assert.deepEqual(later.ids.slice(0, first.ids.length), first.ids);
  assert.equal(later.ids.indexOf('b'), selected.ids.indexOf('b'));
  assert.deepEqual(appendVisit(later, [priced('new', 999)]), later);
});

test('ordinary horizontal steps stop at boundaries and reverse exactly', () => {
  let visit = createVisit(species, [priced('a', 10), priced('b', 5)], 'USD');
  const positions = [visit.selectedId];
  for (let i = 0; i < 10; i++) { visit = stepVisit(visit, 1); positions.push(visit.selectedId); }
  assert.equal(visit.selectedId, 'b');
  for (let i = 0; i < 10; i++) visit = stepVisit(visit, -1);
  assert.equal(visit.selectedId, positions[0]);
});

test('incoming slides prepare their card identity before activation and retain it through enrichment', () => {
  const incoming = { ...species, id: 2 };
  const edition = { ...priced('incoming', 10), pokemonId: 2 };
  const prepared = prepareVisits({}, [species, incoming], [edition], 'USD');
  assert.equal(prepared[2].selectedId, 'official-2');
  const enriched = [edition, { ...edition, cardId: 'later', prices: [{ amount: 999, currency: 'USD', updatedAt: new Date().toISOString() }] }];
  assert.equal(prepareVisits(prepared, [incoming], enriched, 'USD'), prepared);
  assert.equal(appendVisit(prepared[2], enriched).selectedId, 'official-2');
});
