import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/card-library.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { belongsToSpecies, cardSpeciesIds, mergeCardLibrary } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('discovering a shared card for another species preserves both galleries and one artist entry', () => {
  const first = { cardId:'shared-card', pokemonId:25, pokemonName:'Pikachu', pokemonIds:[25,133], artist:'Artist', sourceType:'catalog', prices:[] };
  let library = mergeCardLibrary([], [first]);
  const selectedId = library[0].cardId;
  library = mergeCardLibrary(library, [{ ...first, pokemonId:133, pokemonName:'Eevee', prices:[{ amount:12, currency:'USD' }] }]);
  assert.equal(library.filter(card => belongsToSpecies(card,25)).length, 1);
  assert.equal(library.filter(card => belongsToSpecies(card,133)).length, 1);
  assert.equal(library.filter(card => card.artist === 'Artist').length, 1);
  assert.equal(library.find(card => card.cardId === selectedId).pokemonName, 'Pikachu');
  assert.deepEqual(library[0].prices, [{ amount:12, currency:'USD' }]);
});

test('live multi-species membership refreshes prices without replacing reviewed provenance', () => {
  const reviewed = { cardId:'reviewed', pokemonId:25, pokemonName:'Pikachu', artist:'Reviewed Artist', imageSha256:'reviewed-hash', artistEvidenceMethod:'printed scan' };
  const incoming = { cardId:'reviewed', pokemonId:133, pokemonIds:[25,133], artist:'Provider Artist', sourceType:'catalog', imageSha256:'', prices:[{ amount:23, currency:'EUR' }] };
  const library = mergeCardLibrary([reviewed], [incoming]);
  assert.equal(library[0].artist, 'Reviewed Artist');
  assert.equal(library[0].imageSha256, 'reviewed-hash');
  assert.equal(library[0].artistEvidenceMethod, 'printed scan');
  assert.equal(library[0].sourceType, undefined);
  assert.deepEqual(cardSpeciesIds(library[0]), [25,133]);
  assert.deepEqual(library[0].prices, incoming.prices);
});

test('legacy cards retain their original species without expanded metadata', () => {
  const card = { cardId:'legacy', pokemonId:887 };
  assert.deepEqual(cardSpeciesIds(card), [887]);
  assert.equal(belongsToSpecies(card,887), true);
  assert.equal(belongsToSpecies(card,94), false);
});
