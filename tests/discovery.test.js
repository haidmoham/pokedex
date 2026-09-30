import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPrices,normalizeCard,discoverCards} from '../server/discovery.js';
const now=Date.parse('2026-09-30T00:00:00Z');
test('price comparison uses fresh market values and keeps currencies distinct',()=>{
 const prices=extractPrices({tcgplayer:{unit:'USD',updated:'2026-09-29T00:00:00Z',normal:{marketPrice:15,highPrice:9999},holo:{marketPrice:0}},cardmarket:{unit:'EUR',updated:'2026-09-29T00:00:00Z',trend:20}},now);
 assert.deepEqual(prices.map(p=>[p.amount,p.currency]),[[15,'USD'],[20,'EUR']]);
});
test('stale, future, missing and nonfinite prices are not valuations',()=>{
 assert.deepEqual(extractPrices({tcgplayer:{unit:'USD',updated:'2020-01-01',normal:{marketPrice:100}}},now),[]);
 assert.deepEqual(extractPrices({tcgplayer:{unit:'USD',updated:'2030-01-01',normal:{marketPrice:100}}},now),[]);
 assert.deepEqual(extractPrices({tcgplayer:{unit:'USD',updated:'2026-09-29',normal:{marketPrice:Infinity}}},now),[]);
});
test('catalog cards require exact species attribution and a recognized image source',()=>{
 const raw={id:'test-1',name:'Dragapult',dexId:[887],illustrator:'Example',image:'https://assets.tcgdex.net/en/test/1',localId:'1',set:{name:'Test',cardCount:{official:2}}};
 assert.equal(normalizeCard(raw,{id:94,name:'Gengar'}),null);
 assert.equal(normalizeCard({...raw,image:'https://unrelated.test/x'},{id:887,name:'Dragapult'}),null);
 const card=normalizeCard(raw,{id:887,name:'Dragapult'});
 assert.equal(card.artist,'Example'); assert.equal(card.sourceType,'catalog'); assert.equal(card.publisherCheck,'not independently reviewed');
 assert.deepEqual(normalizeCard({...raw,dexId:[887,94]},{id:887,name:'Dragapult'}).pokemonIds,[887,94]);
});
test('discovery returns bounded batches and explicit missing-source coverage',async()=>{
 const list=Array.from({length:14},(_,i)=>({id:`test-${i}`}));let calls=0,active=0,max=0;
 const fake=async url=>{
  calls++; if(url.includes('?'))return {ok:true,json:async()=>list};
  active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;
  if(url.endsWith('test-1'))return {ok:false,status:503};
  return {ok:true,json:async()=>({id:url.split('/').at(-1),name:'Test',dexId:[9999],illustrator:'Artist',image:'https://assets.tcgdex.net/en/test/1'})};
 };
 const result=await discoverCards({id:9999,name:'Test'},0,fake);
 assert.equal(result.scanned,12);assert.equal(result.nextOffset,12);assert.equal(result.total,14);assert.equal(result.failed.length,1);assert.ok(max<=3);assert.equal(calls,13);
});

for (const pokemon of [{ id:1, name:'Bulbasaur', count:13 }, { id:25, name:'Pikachu', count:26 }, { id:887, name:'Dragapult', count:17 }]) {
 test(`discovery uses exact dex membership and species-scoped page totals for #${pokemon.id}`,async()=>{
  const exact=Array.from({length:pokemon.count},(_,index)=>({id:`exact-${pokemon.id}-${String(index).padStart(2,'0')}`}));
  const requested=[];
  const fake=async url=>{
   requested.push(url);
   if(url.includes('?')) {
    // The live API defaults to lax substring matching. This is the regression:
    // #1 includes #10/#125 and #25 includes #125 without the eq: prefix.
    assert.equal(new URL(url).searchParams.get('dexId'),`eq:${pokemon.id}`);
    return {ok:true,json:async()=>exact};
   }
   return {ok:true,json:async()=>({id:url.split('/').at(-1),name:pokemon.name,
    dexId:pokemon.id===25 ? [25,644] : [pokemon.id],illustrator:'Artist',
    image:'https://assets.tcgdex.net/en/test/1'})};
  };
  let offset=0,scanned=0;const found=[];
  do {
   const page=await discoverCards(pokemon,offset,fake);
   assert.equal(page.total,pokemon.count);
   assert.ok(page.scanned<=12);
   assert.equal(page.offset,offset);
   assert.equal(page.nextOffset,offset+page.scanned<pokemon.count ? offset+page.scanned : null);
   scanned+=page.scanned;found.push(...page.cards);offset=page.nextOffset;
  } while(offset!==null);
  assert.equal(scanned,pokemon.count);assert.equal(found.length,pokemon.count);
  assert.equal(requested.filter(url=>url.includes('?')).length,1);
  assert.ok(found.every(card=>card.pokemonIds.includes(pokemon.id)));
  if(pokemon.id===25)assert.deepEqual(found[0].pokemonIds,[25,644]);
 });
}
