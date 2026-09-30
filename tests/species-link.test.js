import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/species-link.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { linkedSpecies, speciesLink, speciesAddress } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('shared links round-trip national IDs and keep the current preview or mirror origin', () => {
  for (const origin of ['https://preview.vercel.app','https://pokedex.mhaider.dev','https://pokedex.shin86.dev']) {
    for (const id of [1,150,1025]) {
      const link = new URL(speciesLink(origin, id));
      assert.equal(link.origin, origin);
      assert.equal(linkedSpecies(link.search), id);
      assert.equal(link.pathname, '/');
    }
  }
  assert.equal(linkedSpecies('?pokemon=0150'),150);
});
test('visible species addresses replace stale numbers while retaining other URL context', () => {
  let url = 'https://preview.vercel.app/?pokemon=150&panel=example#dex';
  url = speciesAddress(url,151);
  assert.equal(new URL(url).searchParams.get('pokemon'),'151');
  assert.equal(new URL(url).searchParams.get('panel'),'example');
  assert.equal(new URL(url).hash,'#dex');
  url = speciesAddress(url,150);
  assert.equal(linkedSpecies(new URL(url).search),150);
  assert.equal(new URL(url).searchParams.getAll('pokemon').length,1);
});
test('invalid or absent shared IDs fall back to the dex start without unsafe destinations', () => {
  for (const search of ['', '?pokemon=', '?pokemon=0', '?pokemon=1026', '?pokemon=-1', '?pokemon=1.5', '?pokemon=150abc', '?pokemon=https://other.test']) assert.equal(linkedSpecies(search),null);
  for (const id of [0,1026,1.5,NaN]) assert.throws(() => speciesLink('https://pokedex.mhaider.dev',id),/Invalid national number/);
});
