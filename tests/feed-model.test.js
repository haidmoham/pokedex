import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/feed-model.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { nationalDex, adjacentIndex, FeedPosition, officialEdition, recentPrice, rankedCards, rememberFailedImage, retryFailedImages, selectedCard } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const species = JSON.parse(await readFile(new URL('../content/species.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-09-30T00:00:00Z');
const price = (amount, currency = 'USD', updatedAt = '2026-09-29T00:00:00Z') => ({ amount, currency, updatedAt });

test('the full offline feed starts at Bulbasaur and contains every national dex ID in order', () => {
  const feed = nationalDex([...species].reverse());
  assert.equal(feed.length, 1025);
  assert.equal(feed[0].name, 'Bulbasaur');
  assert.deepEqual(feed.map(item => item.id), Array.from({ length: 1025 }, (_, index) => index + 1));
  assert.equal(feed[1024].name, 'Pecharunt');
});

test('species movement never wraps #1 to #1025 and visits every entry in both directions', () => {
  let index = 0;
  assert.equal(adjacentIndex(index, -1, 1025), 0);
  for (let expected = 1; expected < 1025; expected++) {
    index = adjacentIndex(index, 1, 1025);
    assert.equal(index, expected);
  }
  assert.equal(adjacentIndex(index, 1, 1025), 1024);
  for (let expected = 1023; expected >= 0; expected--) {
    index = adjacentIndex(index, -1, 1025);
    assert.equal(index, expected);
  }
});

function fakeViewport() {
  return {
    clientWidth: 800, scrollLeft: 0, style: { overflowX: 'auto' }, requests: [],
    scrollTo(options) { this.requests.push(options); this.scrollLeft = options.left; },
  };
}

test('rapid explicit species commands advance synchronously without waiting for scroll events', () => {
  const feed = fakeViewport();
  const position = new FeedPosition();
  for (let i = 0; i < 8; i++) position.jump(feed, position.index + 1, 1025);
  assert.equal(position.index, 8);
  assert.equal(feed.scrollLeft, 8 * feed.clientWidth);
  for (let i = 0; i < 12; i++) position.jump(feed, position.index - 1, 1025);
  assert.equal(position.index, 0);
  position.jump(feed, 9999, 1025);
  assert.equal(position.index, 1024);
  assert.ok(feed.requests.every(request => request.behavior === 'instant'));
});

test('drawer inspection settles momentum and rejects late scroll or navigation changes', () => {
  const feed = fakeViewport();
  const position = new FeedPosition();
  position.jump(feed, 24, 1025);
  feed.scrollLeft += 450;
  position.lock(feed, 24);
  assert.equal(position.locked, true);
  assert.equal(feed.style.overflowX, 'hidden');
  assert.equal(feed.scrollLeft, 24 * 800);
  // A late native scroll event must not replace the inspected species.
  feed.scrollLeft = 40 * 800;
  assert.equal(position.sync(feed, 1025), 24);
  assert.equal(position.jump(feed, 80, 1025), 24);
  // Resizing for a mobile keyboard keeps the same species, not the old pixels.
  feed.clientWidth = 500;
  position.settle(feed);
  assert.equal(feed.scrollLeft, 24 * 500);
  assert.equal(position.unlock(feed), 24);
  assert.equal(feed.style.overflowX, 'auto');
  assert.equal(position.locked, false);
  assert.equal(position.unlock(feed), null);
  feed.scrollLeft = 25 * 500;
  assert.equal(position.sync(feed, 1025), 25);
});

test('failed artwork retries only on explicit retry or connectivity recovery', () => {
  const failed = rememberFailedImage([], 'failed-a');
  assert.equal(rememberFailedImage(failed, 'failed-a'), failed);
  const twoFailures = rememberFailedImage(failed, 'failed-b');
  assert.deepEqual(retryFailedImages(twoFailures, 'failed-a'), ['failed-b']);
  // If the deliberate retry fails, it returns to the blocked state rather than looping.
  const failedAgain = rememberFailedImage(retryFailedImages(twoFailures, 'failed-a'), 'failed-a');
  assert.deepEqual(failedAgain, ['failed-b', 'failed-a']);
  assert.equal(rememberFailedImage(failedAgain, 'failed-a'), failedAgain);
  assert.deepEqual(retryFailedImages(failedAgain), []);
});

test('all species have an API-independent official slide with explicitly separate provenance', () => {
  for (const pokemon of species) {
    const official = officialEdition(pokemon);
    assert.equal(official.cardId, `official-${pokemon.id}`);
    assert.equal(official.pokemonId, pokemon.id);
    assert.equal(official.sourceType, 'official');
    assert.equal(official.artist, 'Individual artist not specified');
    assert.equal(official.imageProvider, 'PokéAPI sprites');
    assert.ok(official.image.endsWith(`/${pokemon.id}.png`));
    assert.equal(official.prices, undefined);
    assert.equal(official.publisherUrl, undefined);
    assert.equal(selectedCard([official]), official);
  }
});

test('fresh real prices lead in the selected currency without mutating the library', () => {
  const cards = [
    { cardId: 'unpriced' },
    { cardId: 'dollars', prices: [price(40), price(12, 'EUR')] },
    { cardId: 'euros', prices: [price(5), price(80, 'EUR')] },
    { cardId: 'stale', prices: [price(9999, 'USD', '2026-09-20T00:00:00Z')] },
  ];
  assert.equal(rankedCards(cards, 'USD', now)[0].cardId, 'dollars');
  assert.equal(rankedCards(cards, 'EUR', now)[0].cardId, 'euros');
  assert.equal(cards[0].cardId, 'unpriced');
  assert.equal(recentPrice(cards[3], 'USD', now), undefined);
  assert.equal(recentPrice({ prices: [price(Infinity), price(-1), price(0)] }, 'USD', now), undefined);
});

test('swiped, tapped and inspected artwork keeps its identity when discovery changes the order', () => {
  const official = officialEdition(species[0]);
  const initial = [{ cardId: 'first', prices: [price(15)] }, official];
  const chosen = selectedCard(initial, official.cardId);
  const discovered = [...rankedCards([...initial.slice(0, 1), { cardId: 'valuable', prices: [price(500)] }], 'USD', now), official];
  assert.equal(selectedCard(discovered).cardId, 'valuable');
  assert.equal(selectedCard(discovered, chosen.cardId).cardId, official.cardId);
  assert.equal(selectedCard(discovered, 'first').cardId, 'first');
  assert.equal(selectedCard(discovered, 'missing').cardId, 'valuable');
});

test('the feed uses native vertical scrolling while modal drawers and pinch zoom remain native', async () => {
  const app = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(app, /useState\(0\)/);
  assert.match(app, /import speciesSnapshot from '\.\.\/content\/species\.json'/);
  assert.match(app, /<dialog\b/);
  assert.match(app, /dialog\.showModal\(\)/);
  assert.match(app, /onCancel=\{event => \{ event\.preventDefault\(\); closeDrawer\(\); \}\}/);
  assert.match(app, /<ArtGallery\b/);
  assert.doesNotMatch(app, /wheel\.current\.handle/);
  assert.match(app, /if \(drawerRef\.current \|\| feedPosition\.current\.locked\) return/);
  assert.match(app, /feedPosition\.current\.lock\(feedRef\.current, feedSelected\)/);
  assert.match(app, /window\.addEventListener\('online', recoverImages\)/);
  assert.doesNotMatch(app, /setPointerCapture|navigation\?\.axis === 'y'/);
  assert.match(css, /scroll-snap-type: y mandatory/);
  assert.match(css, /scroll-snap-stop: always/);
  assert.match(css, /touch-action: pan-x pan-y pinch-zoom/);
  assert.match(css, /\.drawer-scroll \{ overflow-y: auto/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
