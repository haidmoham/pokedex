// Public, read-only TCGdex discovery. No credentials or invented valuations.
const ROOT = 'https://api.tcgdex.net/v2/en/cards';
const cache = new Map();
const TTL = 30 * 60 * 1000;
async function cachedJson(url, fetcher) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < TTL) return hit.value;
  const response = await fetcher(url, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`source returned ${response.status}`);
  const value = await response.json();
  if (cache.size >= 1000) cache.delete(cache.keys().next().value);
  cache.set(url, { time: Date.now(), value });
  return value;
}
export function extractPrices(pricing, now = Date.now()) {
  const prices = [];
  const fresh = value => { const time = Date.parse(value); return Number.isFinite(time) && time <= now + 86400000 && now - time <= 7 * 86400000; };
  const us = pricing?.tcgplayer;
  if (us?.unit === 'USD' && fresh(us.updated)) {
    for (const [variant, data] of Object.entries(us)) {
      if (data && typeof data === 'object' && Number.isFinite(data.marketPrice) && data.marketPrice > 0) {
        prices.push({ amount: data.marketPrice, currency: 'USD', variant, updatedAt: us.updated, provider: 'TCGplayer via TCGdex', metric: 'market price', url: Number.isInteger(data.productId) ? `https://www.tcgplayer.com/product/${data.productId}` : 'https://tcgdex.dev/markets-prices' });
      }
    }
  }
  const eu = pricing?.cardmarket;
  if (eu?.unit === 'EUR' && fresh(eu.updated)) {
    for (const [key, variant] of [['trend', 'normal'], ['trend-holo', 'holo']]) {
      if (Number.isFinite(eu[key]) && eu[key] > 0) prices.push({ amount: eu[key], currency:'EUR', variant, updatedAt:eu.updated, provider:'Cardmarket via TCGdex', metric:'trend price', url:'https://tcgdex.dev/markets-prices' });
    }
  }
  return prices;
}
export function normalizeCard(card, pokemon) {
  if (!card || !Array.isArray(card.dexId) || !card.dexId.includes(pokemon.id) || !card.id || !card.illustrator || !/^https:\/\/assets\.tcgdex\.net\//.test(card.image ?? '')) return null;
  return {
    pokemonId:pokemon.id, pokemonName:pokemon.name, cardId:card.id,
    title:card.name, set:card.set?.name ?? 'set not provided', number:`${card.localId}/${card.set?.cardCount?.official ?? '?'}`,
    language:'en', rarity:card.rarity ?? 'not provided', artist:card.illustrator,
    image:`${card.image}/high.webp`, imageProvider:'TCGdex',
    imageSha256:'',
    tcgdexUrl:`${ROOT}/${encodeURIComponent(card.id)}`,
    publisherCheck:'not independently reviewed', artistEvidenceMethod:'TCGdex metadata',
    artistEvidenceUrl:`${ROOT}/${encodeURIComponent(card.id)}`, artistObservedText:card.illustrator,
    prices:extractPrices(card.pricing), sourceType:'catalog',
  };
}
export async function discoverCards(pokemon, offset = 0, fetcher = fetch) {
  const list = await cachedJson(`${ROOT}?dexId=${pokemon.id}`, fetcher);
  if (!Array.isArray(list)) throw new Error('invalid source list');
  const eligible = list.filter(c => typeof c.id === 'string' && /^[-\w.]+$/.test(c.id)).sort((a,b)=>a.id.localeCompare(b.id));
  const batch = eligible.slice(offset,offset+12);
  const cards=[]; const failed=[];
  // At most three upstream requests at once, bounded to twelve per page.
  for(let start=0;start<batch.length;start+=3) {
    await Promise.all(batch.slice(start,start+3).map(async item=>{
      try {const card=normalizeCard(await cachedJson(`${ROOT}/${encodeURIComponent(item.id)}`,fetcher),pokemon); if(card)cards.push(card);}
      catch {failed.push(item.id);}
    }));
  }
  return {cards, failed, offset, nextOffset:offset+batch.length < eligible.length ? offset+batch.length : null, total:eligible.length, scanned:batch.length, fetchedAt:new Date().toISOString(), scope:'English TCGdex editions. Ungraded marketplace values; no auction or graded-card records.'};
}
