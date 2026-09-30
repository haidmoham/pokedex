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
