import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/search-model.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { searchSpecies, generationOf, rememberSearchPick, validRecentPicks } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const species = JSON.parse(await readFile(new URL('../content/species.json', import.meta.url), 'utf8'));
test('number lookup accepts trimmed, hash and zero-padded IDs with explicit invalid handling', () => {
  for (const query of ['150','#150','00150',' #000150 ','# 150']) assert.deepEqual(searchSpecies(species,query).results.map(item=>item.id),[150]);
  assert.equal(searchSpecies(species,'1025').results[0].id,1025);
  for(const query of ['0','#000','1026','-1','1.5','150abc','#name']) { const result=searchSpecies(species,query); assert.equal(result.invalidNumber,true); assert.deepEqual(result.results,[]); }
});
test('names forgive punctuation, accents, spaces and a single typo', () => {
  for(const [query,id] of [[' mr. mime ',122],['flabebe',669],['mewto',150],['pikchu',25],['nidoran f',29],['iron lea',1010]]) assert.equal(searchSpecies(species,query).results[0].id,id);
  assert.deepEqual(searchSpecies(species,'').results.map(item=>item.id),species.map(item=>item.id));
  assert.deepEqual(searchSpecies(species,'not a pokemon').results,[]);
});
test('type, generation and saved filters combine with numeric lookup and honest zero results', () => {
  assert.deepEqual(searchSpecies(species,'#150','psychic','1',[150],true).results.map(item=>item.id),[150]);
  for(const args of [['#150','fire','1',[150],true],['#150','psychic','2',[150],true],['#150','psychic','1',[],true]]) assert.deepEqual(searchSpecies(species,...args).results,[]);
  assert.deepEqual([151,152,251,252,809,810,905,906,1025].map(generationOf),[1,2,2,3,7,8,8,9,9]);
});
test('recent picks are deduplicated, valid and bounded to eight', () => {
  let recent=[]; for(let id=1;id<=12;id++) recent=rememberSearchPick(recent,id);
  assert.deepEqual(recent,[12,11,10,9,8,7,6,5]); assert.deepEqual(rememberSearchPick(recent,8),[8,12,11,10,9,7,6,5]);
  assert.equal(rememberSearchPick(recent,1026),recent); assert.deepEqual(validRecentPicks([150,150,-1,'25',1026,25]),[150,25]); assert.deepEqual(validRecentPicks({}),[]);
});
test('icon rasters match head declarations and embed copy is consistent', async () => {
  for(const [file,size] of [['favicon-32.png',32],['apple-touch-icon.png',180],['icons/pokeball-192.png',192],['icons/pokeball-512.png',512]]) { const png=await readFile(new URL(`../public/${file}`,import.meta.url)); assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size); }
  const head=await readFile(new URL('../index.html',import.meta.url),'utf8'); assert.equal((head.match(/content="a pokédex you can doomscroll"/g)??[]).length,3); assert.match(head,/rel="icon" href="\/favicon.svg"/); assert.match(head,/rel="apple-touch-icon"/); assert.doesNotMatch(head,/vite.svg/);
});
