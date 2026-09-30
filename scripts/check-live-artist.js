// Explicit read-only check of two bounded artist pages, not a bulk import.
// Run: node scripts/check-live-artist.js [deployed-base-url] [literal-artist-credit]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { discoverArtistCards } from '../server/artist-discovery.js';
const base = process.argv[2];
const artist = process.argv[3] ?? 'Mitsuhiro Arita';
const reviewed = new Set(JSON.parse(await readFile(new URL('../content/cards.json', import.meta.url))).map(card=>card.cardId));
const found = new Set();
let offset=0, total=null, newCards=0;
for(let page=0;page<2 && offset!==null;page++) {
  let result;
  if(base) {
    const response=await fetch(`${base.replace(/\/$/,'')}/api/artists/${encodeURIComponent(artist)}?offset=${offset}`,{signal:AbortSignal.timeout(70000)});
    assert.equal(response.ok,true,'deployed artist endpoint');
    assert.match(response.headers.get('content-type')??'',/application\/json/,'endpoint must return JSON; a protected preview may require browser sign-in');
    result=await response.json();
  } else result=await discoverArtistCards(artist,offset);
  assert.equal(result.artist,artist);
  assert.equal(result.offset,offset);
  assert.ok(result.scanned<=12);
  assert.equal(result.cards.length+result.failed.length+result.skipped.length,result.scanned);
  if(total!==null)assert.equal(result.total,total);else total=result.total;
  for(const card of result.cards) {
    assert.equal(card.artist,artist);
    assert.ok(card.pokemonIds.length>0 && card.pokemonIds.every(id=>Number.isInteger(id)&&id>=1&&id<=1025));
    assert.equal(found.has(card.cardId),false,'pages must not duplicate card identities');
    found.add(card.cardId);if(!reviewed.has(card.cardId))newCards++;
  }
  console.log(JSON.stringify({artist,total:result.total,offset,scanned:result.scanned,cards:result.cards.length,failed:result.failed.length,skipped:result.skipped.length,nextOffset:result.nextOffset}));
  offset=result.nextOffset;
}
assert.ok(newCards>0,'portfolio must discover artwork absent from the saved manifest');
console.log(JSON.stringify({uniqueCards:found.size,newToManifest:newCards}));
