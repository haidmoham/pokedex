# pokédex

An artwork-first, full-height Pokédex feed. Swipe up from Bulbasaur through all 1,025 species, and swipe sideways through each Pokémon's card art. Artist credit stays visible; details live one tap away.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves the React app and proxies `/api` to Express on port 3001.

```sh
npm test
npm run audit:cards
npm run build
npm start
```

`npm start` serves the built app and API from port 3001. `PORT` changes that port. The legacy Railway favorites endpoint uses `DATA_FILE` (default `data/favorites.json`, gitignored); the current client never calls it and stores favorites privately in this browser.

## The feed

- Opens immediately on Bulbasaur (#001). Every species stays in strict national-dex order through Pecharunt (#1025), with real endpoints rather than a #1-to-#1025 wrap.
- Native vertical scroll snapping handles touch, mouse wheels and trackpads. Only the current and adjacent artworks mount, so scrolling does not preload thousands of images.
- Left/right swipes, horizontal trackpad gestures and arrow buttons change artwork. Card editions loop; species do not.
- Up/down arrows, Page Up/Down, Home/End and species buttons offer keyboard/button alternatives. Search jumps to any name or number without filtering or reordering the feed.
- A concise credit appears with the species name. The info drawer contains exact edition identity, thumbnails, source evidence, market prices and discovery coverage. Artist names open a gallery of the illustrator's already-loaded cards.
- Native modal dialogs preserve focus, Escape dismissal, independent scrolling and browser pinch zoom. The feed accounts for mobile safe areas and reduced-motion settings.
- Favorites are private browser-local data, with no account or shared server writes.

The 1,025-species PokéAPI snapshot is bundled in the client. Every species has a separately labeled official-art slide even when card APIs fail. Images still require their original remote host; the offline catalog is not an offline image cache.

## Card editions, credit and pricing

[`content/cards.json`](content/cards.json) contains 23 independently reviewed editions across 19 species. Each record binds the exact edition, literal artist spelling, image and supporting publisher-page or printed-scan evidence. The reviewed manifest's admission rules and `npm run audit:cards` remain intact.

Read-only live TCGdex discovery expands that collection with a distinct provenance tier: exact species membership and provider artist metadata, explicitly labeled as not independently reviewed. Shared TAG TEAM cards belong to all recorded species without duplicate artist-gallery entries; refreshing prices never replaces reviewed provenance.

`/api/discovery/:id?offset=0` checks twelve source candidates per page, with at most three upstream detail requests concurrently. The active species loads incrementally; moving to another aborts obsolete work. Failed and partial coverage is visible in the details drawer and retryable.

The highest recent available value leads each unselected gallery. USD TCGplayer market prices and EUR Cardmarket trend prices remain separate; values older than seven days are excluded by both server and client. The scope is English ungraded editions, not historical auctions or graded specimens. Swiping, selecting or inspecting an edition pins its card ID, so later discovery or price reordering cannot switch the inspected artwork. Prices are read-only and are not purchase offers. See [TCGdex pricing documentation](https://tcgdex.dev/markets-prices).

Official species art has no invented individual artist credit. DeviantArt and Pixiv are outbound discovery links, not imported or rehosted galleries. Card-art rights are separate from the source code. No scan files are committed.

See [`docs/experience-contract.md`](docs/experience-contract.md) for the UX and evidence guarantees.

## Deployment

The Vercel preview uses [`vercel.json`](vercel.json) to build the Vite client and route read-only API calls through [`api/index.js`](api/index.js). Its stateless API rejects shared favorite writes.

The existing Railway configuration builds `haidmoham/pokedex` from `main` using [`railway.json`](railway.json). One Express service serves the client and API. Its configured domain is <https://pokedex.shin86.dev>; this document does not assert the live deployment revision. The legacy server can retain its volume-backed favorites endpoint without exposing those writes from the new client.

## Verification

`npm test` covers the complete 1–1025 sequence and endpoints, API-independent official slides, recent same-currency price ranking, pinned card identity, shared-card membership and reviewed provenance, gesture cancellation/momentum, source pagination, stateless API behavior and server validation. `npm run build` runs TypeScript validation and creates production assets.

Browser QA checklist:

1. Load a fresh session: #001 Bulbasaur appears. Swipe/scroll up to #002 Ivysaur and #003 Venusaur; reverse back to #001. Scrolling above #001 stays there.
2. Swipe left/right on a species with multiple editions. Confirm artwork and credit change together; later discovery must not replace a manually chosen edition.
3. Search for #1025, open Pecharunt, and verify the last-species control is disabled. Search back to #001 without changing feed order.
4. Try all arrow keys, Page Up/Down, Home/End and visible buttons. Focus should remain visible. Horizontal momentum changes at most one edition per gesture.
5. Open details, scroll its complete content, change currency, select a thumbnail, and close using the button, Escape and backdrop. Feed position should stay put. Follow an artist and open a specific card; its identity must be retained.
6. Filter search by type and saved species. Save/reload/unsave and verify local persistence. No favorite API writes should occur.
7. Block API calls and reload. All species must remain scrollable with correctly labeled official artwork. Break an image URL: retain its identity and show an unavailable state rather than attaching a different image to its credit.
8. Check widths 320, 390 and 1280, short landscape viewports, increased text size, reduced motion, touch pinch zoom and real-device swipes. Main artwork must remain uncropped; source drawers must scroll without moving the feed.

Automated checks do not claim physical-device or screenshot verification. The parent task verifies the deployed preview in its browser before delivery.
