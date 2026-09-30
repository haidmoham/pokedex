// Explicit read-only integration smoke test; not part of offline npm test.
// Run: node scripts/check-live-discovery.js [deployed-base-url]
import assert from 'node:assert/strict';
import { discoverCards } from '../server/discovery.js';
const base = process.argv[2];
for (const pokemon of [{id:1,name:'Bulbasaur'}, {id:25,name:'Pikachu'}, {id:887,name:'Dragapult'}]) {
  const response = await fetch(`https://api.tcgdex.net/v2/en/cards?dexId=eq:${pokemon.id}`, {signal:AbortSignal.timeout(20000)});
  assert.equal(response.ok,true,`upstream list for #${pokemon.id}`);
  const source = await response.json();
  assert.ok(Array.isArray(source));
  const expectedTotal = source.filter(card=>typeof card.id==='string' && /^[-\w.]+$/.test(card.id)).length;
  let result;
  if (base) {
    const deployed = await fetch(`${base.replace(/\/$/,'')}/api/discovery/${pokemon.id}?offset=0`, {signal:AbortSignal.timeout(60000)});
    assert.equal(deployed.ok,true,`deployed discovery for #${pokemon.id}`);
    result=await deployed.json();
  } else result=await discoverCards(pokemon);
  assert.equal(result.total,expectedTotal,`exact species denominator for #${pokemon.id}`);
  assert.equal(result.scanned,Math.min(12,expectedTotal));
  assert.equal(result.nextOffset,expectedTotal>12 ? 12 : null);
  assert.ok(result.cards.length>0,`first page has usable ${pokemon.name} artwork`);
  assert.ok(result.cards.every(card=>card.pokemonIds.includes(pokemon.id)));
  console.log(JSON.stringify({id:pokemon.id,name:pokemon.name,total:result.total,scanned:result.scanned,cards:result.cards.length,failed:result.failed.length,nextOffset:result.nextOffset}));
}
