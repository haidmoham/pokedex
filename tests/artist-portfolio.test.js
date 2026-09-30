import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/artist-portfolio.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { ArtistPortfolio, portfolioCoverage, portfolioCards, portfolioTarget, portfolioResponseError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const settle = () => new Promise(resolve => setImmediate(resolve));
const card = (id, artist = 'Artist') => ({ cardId:id, artist, pokemonId:1, pokemonIds:[1], sourceType:'catalog' });
const page = (artist='Artist', offset=0, options={}) => ({ artist, offset, cards:[card(`new-${offset}`,artist)], nextOffset:offset+12<24 ? offset+12 : null, total:24, scanned:12, failed:[], skipped:[], sourceUrl:`https://api.tcgdex.net/v2/en/illustrators/${encodeURIComponent(artist)}`, fetchedAt:'2026-09-30', ...options });
const response = value => ({ ok:true, status:200, headers:new Headers({'content-type':'application/json'}), json:async()=>value });
const deferred = () => { let resolve; const promise=new Promise(done=>resolve=done); return {promise,resolve}; };

// No speculative hydration: only opening and explicit pagination create calls.
test('opening an artist exposes loaded artwork immediately and requests only one encoded page',async()=>{
 const pending=deferred(), calls=[], merged=[];
 const store=new ArtistPortfolio(()=>{},cards=>merged.push(...cards),(url,options)=>{calls.push({url,options});return pending.promise;});
 store.open('Artist & Co.',[card('saved','Artist & Co.')]);
 assert.deepEqual(portfolioCards(store.get('Artist & Co.'),[card('saved','Artist & Co.')],'Artist & Co.').map(c=>c.cardId),['saved']);
 assert.equal(store.get('Artist & Co.').loading,true);
 assert.equal(calls[0].url,'/api/artists/Artist%20%26%20Co.?offset=0');
 pending.resolve(response(page('Artist & Co.')));await settle();
 assert.equal(calls.length,1);assert.equal(merged.length,1);assert.equal(store.get('Artist & Co.').loading,false);
 assert.equal(portfolioCoverage(store.get('Artist & Co.')).nextOffset,12);store.close();
});

test('duplicate load-more clicks share the current request and never skip an offset',async()=>{
 const pending=deferred(),calls=[];
 const store=new ArtistPortfolio(()=>{},()=>{},async url=>{calls.push(url);return calls.length===1 ? response(page()) : pending.promise;});
 store.open('Artist',[]);await settle();
 const first=store.loadMore(),second=store.loadMore();
 assert.equal(calls.length,2);assert.ok(calls[1].endsWith('offset=12'));
 pending.resolve(response(page('Artist',12)));await Promise.all([first,second]);
 assert.equal(portfolioCoverage(store.get('Artist')).scanned,24);
 assert.equal(portfolioCoverage(store.get('Artist')).nextOffset,null);store.close();
});

test('retry replaces a failed page without duplicate tiles, coverage inflation or pagination gaps',async()=>{
 const calls=[], merged=[];let attempts=0;
 const store=new ArtistPortfolio(()=>{},cards=>merged.push(...cards),async url=>{
  const offset=Number(new URL(url,'https://example.test').searchParams.get('offset'));calls.push(offset);
  if(offset===0 && attempts++===0)return response(page('Artist',0,{failed:['recover'],skipped:[{cardId:'trainer',reason:'no_valid_species'}]}));
  return response(page('Artist',offset,{cards:offset===0 ? [card('new-0'),card('recover')] : [card('new-12')],skipped:offset===0 ? [{cardId:'trainer',reason:'no_valid_species'}] : []}));
 });
 store.open('Artist',[]);await settle();await store.loadMore();
 assert.equal(portfolioCoverage(store.get('Artist')).failed.length,1);
 await store.retryFailed();
 const state=store.get('Artist'),coverage=portfolioCoverage(state);
 assert.deepEqual(calls,[0,12,0]);assert.equal(coverage.scanned,24);assert.equal(coverage.failed.length,0);assert.equal(coverage.skipped.length,1);assert.equal(coverage.nextOffset,null);
 assert.deepEqual(portfolioCards(state,merged,'Artist').map(c=>c.cardId),['new-0','new-12','recover']);store.close();
});

test('an unavailable page retries its original offset and leaves loaded cards usable',async()=>{
 let calls=0;const store=new ArtistPortfolio(()=>{},()=>{},async()=>++calls===2 ? {ok:false,status:502,headers:new Headers({'content-type':'application/json'}),json:async()=>({code:'ARTIST_SOURCE_UNAVAILABLE'})} : response(page('Artist',calls===1 ? 0 : 12)));
 store.open('Artist',[]);await settle();await store.loadMore();
 assert.equal(store.get('Artist').failedOffset,12);assert.match(store.get('Artist').error,/ARTIST_SOURCE_UNAVAILABLE/);
 assert.equal(portfolioCoverage(store.get('Artist')).nextOffset,12);
 await store.retryFailed();assert.equal(portfolioCoverage(store.get('Artist')).nextOffset,null);assert.equal(store.get('Artist').error,null);store.close();
});

test('closing cancels transport and stale success cannot merge into a closed or different artist',async()=>{
 const old=deferred(),merged=[],signals=[];
 const store=new ArtistPortfolio(()=>{},cards=>merged.push(...cards),async(url,options)=>{signals.push(options.signal);return url.includes('/First?') ? old.promise : response(page('Second'));});
 store.open('First',[]);store.open('Second',[]);await settle();
 assert.equal(signals[0].aborted,true);old.resolve(response(page('First')));await settle();
 assert.ok(merged.every(item=>item.artist==='Second'));assert.equal(Object.keys(store.get('First').pages).length,0);
 const another=deferred();const second=new ArtistPortfolio(()=>{},cards=>merged.push(...cards),()=>another.promise);
 second.open('Closed',[]);second.close();another.resolve(response(page('Closed')));await settle();
 assert.ok(merged.every(item=>item.artist==='Second'));store.close();
});

test('closing and reopening the same artist rejects the previous request even when it ignores abort',async()=>{
 const first=deferred(),second=deferred();let calls=0;const merged=[];
 const store=new ArtistPortfolio(()=>{},cards=>merged.push(...cards),()=>++calls===1 ? first.promise : second.promise);
 store.open('Artist',[]);store.close();store.open('Artist',[]);
 second.resolve(response(page('Artist',0,{cards:[card('new-session')]})));await settle();
 first.resolve(response(page('Artist',0,{cards:[card('old-session')]})));await settle();
 assert.deepEqual(merged.map(item=>item.cardId),['new-session']);store.close();
});

test('reopening keeps portfolio pages, order and scroll without fetching the entire index again',async()=>{
 let calls=0;const store=new ArtistPortfolio(()=>{},()=>{},async()=>{calls++;return response(page());});
 store.open('Artist',[card('known')]);await settle();store.saveScroll('Artist',475);store.close();
 store.open('Artist',[card('newly-known')]);await settle();
 assert.equal(calls,1);assert.equal(store.get('Artist').scrollTop,475);assert.deepEqual(store.get('Artist').order,['known','new-0','newly-known']);store.close();
});

test('timeout is bounded and leaves an explicit retry while already loaded cards remain',async()=>{
 const store=new ArtistPortfolio(()=>{},()=>{},(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))),5);
 store.open('Artist',[card('known')]);await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(store.get('Artist').loading,false);assert.equal(store.get('Artist').failedOffset,0);assert.match(store.get('Artist').error,/too long/);
 assert.deepEqual(store.get('Artist').order,['known']);store.close();
});

test('artist membership is literal, shared cards appear once and cross-species selection prefers the current species',()=>{
 const state={pages:{},order:['shared','same','shared'],loading:false,error:null,failedOffset:null,scrollTop:0};
 const shared={...card('shared'),pokemonId:3,pokemonIds:[3,251]};
 const library=[shared,card('same'),card('case','artist')];
 assert.deepEqual(portfolioCards(state,library,'Artist').map(c=>c.cardId),['shared','same']);
 const ids=new Set([1,3,251]);
 assert.equal(portfolioTarget(shared,251,ids),251);assert.equal(portfolioTarget(shared,1,ids),3);
 assert.equal(portfolioTarget({pokemonId:9999,pokemonIds:[0,1026]},1,ids),undefined);
});

test('unexpected response artist cannot populate another identity',async()=>{
 const merged=[];const store=new ArtistPortfolio(()=>{},cards=>merged.push(...cards),async()=>response(page('Wrong')));
 store.open('Artist',[]);await settle();assert.equal(merged.length,0);assert.equal(store.get('Artist').failedOffset,0);assert.match(store.get('Artist').error,/did not match/);store.close();
});

test('UI retains independent drawer scrolling, edition pinning and price-source caveat',async()=>{
 const app=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(app,/portfolioTarget\(edition, activePokemon.id, validSpecies\)/);
 assert.match(app,/openPokemon\(item, edition.cardId\)/);
 assert.match(app,/portfolio.saveScroll\(activeArtist, event.currentTarget.scrollTop\)/);
 assert.match(app,/Provider matching can confuse card variants or marketplace IDs/);
 assert.match(app,/highest|Highest available.*provider value/);
});


test('safe HTTP diagnostics distinguish validation metadata without displaying query values',async()=>{
 assert.equal(portfolioResponseError(400,{code:'ARTIST_REQUEST_INVALID',reason:'unexpected_query',unexpectedKeys:['artist','path'],secret:'never-show-this'}),'Portfolio request failed (HTTP 400 · ARTIST_REQUEST_INVALID · unexpected_query · keys: artist, path). Your loaded artwork is still here.');
 assert.doesNotMatch(portfolioResponseError(500,{code:'<script>',reason:'<script>',unexpectedKeys:['password=value']}),/script|password|value/);
 const store=new ArtistPortfolio(()=>{},()=>{},async()=>({ok:false,status:400,headers:new Headers({'content-type':'application/json'}),json:async()=>({code:'ARTIST_REQUEST_INVALID',reason:'unexpected_query',unexpectedKeys:['artist']})}));
 store.open('Artist',[]);await settle();assert.match(store.get('Artist').error,/HTTP 400.*ARTIST_REQUEST_INVALID.*keys: artist/);store.close();
});

test('non-JSON hosting pages and network failures remain distinct diagnostics',async()=>{
 const html=new ArtistPortfolio(()=>{},()=>{},async()=>({ok:true,status:200,headers:new Headers({'content-type':'text/html'}),json:async()=>{throw Error('must not parse HTML');}}));
 html.open('Artist',[]);await settle();assert.match(html.get('Artist').error,/web page instead of data/);html.close();
 const network=new ArtistPortfolio(()=>{},()=>{},async()=>{throw new TypeError('fetch failed');});
 network.open('Artist',[]);await settle();assert.match(network.get('Artist').error,/network error/);network.close();
});
