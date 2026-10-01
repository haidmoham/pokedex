# pokédex

A pokédex you can doomscroll. Move vertically through the national dex, sideways through distinct views and into related artwork. Every move is yours; loading never advances the feed. Each visit keeps its identity and a discovery trail reverses exactly.

Mobile comes first: 320px layouts, native vertical scrolling, ordinary swipes for navigation and explicit Inspect for rotating an admitted 3D view. View order is viable 3D, official art, fresh highest-priced available card, then the remaining gallery and related discovery. Model gaps or failures lead directly to official art. No claim of infinite unique artwork or complete model coverage.

Share any species using the share button beside its name. Native sharing falls back to clipboard or a manual copy field. `?pokemon=150` opens Mewtwo directly, retaining national order and the current preview/mirror origin. Links identify the species; private artwork history is not serialized. A discreet creator credit in details leads to [mhaider.dev](https://mhaider.dev).

The active admitted model plays its idle at a gentle pace, with an explicit Pause idle control. Hidden tabs and open panels pause playback; reduced motion keeps a sampled idle pose still. Rotation remains behind Inspect. Only the active model loads, with unchanged byte/decoded-memory admission and teardown guards.

The approved public 998-model release is documented in [the October 1 release record](docs/public-model-release-2026-10-01.md). Its extracted-asset redistribution rights remain unresolved.

## Run locally

Use Node.js 24. Tests use JSON import attributes.

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

- Opens on the linked species or Bulbasaur (#001). Shuffle is a persistent browser-local switch: forward species moves choose a different species, backward moves retrace the actual session path (up to 2,000 steps). Switching it off resumes national-dex order from the current species. Toggling never navigates. Numerical order has finite #1 and #1025 endpoints.
- Native vertical scroll snapping handles touch, mouse wheels and trackpads. Only the current and adjacent artworks mount, so scrolling does not preload thousands of images.
- Left/right swipes and horizontal trackpad movement reveal artwork continuously through a native snap gallery. Visible arrows and keyboard controls select editions directly. Both artwork and species stop at finite endpoints.
- Up/down arrows, Page Up/Down, Home/End and species buttons offer keyboard/button alternatives. Search jumps to any name or number without filtering or reordering the feed.
- A concise credit appears with the species name. The info drawer contains exact edition identity, thumbnails, source evidence, market prices and discovery coverage. Artist names open real, paginated TCGdex portfolios, with already-loaded artwork shown immediately.
- Native modal dialogs preserve focus, Escape dismissal, independent scrolling and browser pinch zoom. The feed accounts for mobile safe areas and reduced-motion settings.
- Favorites are private browser-local data, with no account or shared server writes.

The 1,025-species PokéAPI snapshot is bundled in the client. Every species has a separately labeled official-art slide even when card APIs fail. Images still require their original remote host; the offline catalog is not an offline image cache.

## Card editions, credit and pricing

[`content/cards.json`](content/cards.json) contains 23 independently reviewed editions across 19 species. Each record binds the exact edition, literal artist spelling, image and supporting publisher-page or printed-scan evidence. The reviewed manifest's admission rules and `npm run audit:cards` remain intact.

Read-only live TCGdex discovery expands that collection with a distinct provenance tier: exact species membership and provider artist metadata, explicitly labeled as not independently reviewed. Shared TAG TEAM cards belong to all recorded species without duplicate artist-gallery entries; refreshing prices never replaces reviewed provenance.

`/api/discovery/:id?offset=0` checks twelve source candidates per page, with at most three upstream detail requests concurrently. The upstream query uses strict `dexId=eq:<id>` matching, so the coverage total counts exact species candidates rather than IDs containing the same digits. The active species loads incrementally; moving to another aborts obsolete work. Failed and partial coverage is visible in the details drawer and retryable.

The highest recent available value leads each unselected gallery. USD TCGplayer market prices and EUR Cardmarket trend prices remain separate; values older than seven days are excluded by both server and client. The scope is English ungraded editions, not historical auctions or graded specimens. Swiping, selecting or inspecting an edition pins its card ID, so later discovery or price reordering cannot switch the inspected artwork. Prices are read-only and are not purchase offers. TCGdex warns that variant matching and marketplace IDs can be incorrect; the details drawer links this caveat rather than presenting provider values as verified valuations. See [TCGdex pricing documentation](https://tcgdex.dev/markets-prices).

## Illustrator portfolios

`/api/artists/:artist?offset=0` reads the provider's illustrator index, deduplicates and sorts its card IDs, then checks twelve candidate details per requested page. At most three detail requests run concurrently. The provider's normalized index label is never used as the artist identity: every admitted card must carry the exact literal illustrator credit the viewer opened, a valid source image, and at least one dex membership from 1–1025.

The portfolio shows loaded artwork immediately and only requests its first page automatically. Load more requests the next page; it never hydrates a large illustrator's entire catalog in the background. Coverage distinguishes checked candidates, unavailable requests and excluded cards, with reasons. Retry replaces failed pages at the original offsets, preventing skipped pages and double-counted coverage. Cached source responses and in-flight deduplication avoid repeated upstream work.

Selecting an artwork opens that exact edition in the feed, preferring the current species for shared cards and otherwise choosing its lowest valid dex membership. Closing without selecting leaves the original feed/card intact. Reopening retains portfolio pages, tile order and scroll position. Closing or changing artist aborts the pending client request and ignores late responses. A provider outage leaves loaded artwork usable.

Run `node scripts/check-live-artist.js` for an explicit two-page read-only integration check, or append a deployed base URL. It verifies exact credits, valid memberships, page coverage, unique cards and artwork absent from the saved manifest.

The metadata-only evidence tier, reviewed provenance and original-host image policy remain unchanged. These portfolios are TCG card credits, not inferred artist social identities or imported fan-art galleries.

Official species art has no invented individual artist credit. DeviantArt and Pixiv are outbound discovery links, not imported or rehosted galleries. Card-art rights are separate from the source code. No scan files are committed.

See [`docs/experience-contract.md`](docs/experience-contract.md) for the UX and evidence guarantees.

## Deployment

The Vercel preview uses [`vercel.json`](vercel.json) to build the Vite client and route read-only API calls through [`api/index.js`](api/index.js). Its stateless API rejects shared favorite writes.

The existing Railway configuration builds `haidmoham/pokedex` from `main` using [`railway.json`](railway.json). One Express service serves the client and API. Its configured domain is <https://pokedex.shin86.dev>; this document does not assert the live deployment revision. The legacy server can retain its volume-backed favorites endpoint without exposing those writes from the new client.

## Verification

`npm test` covers the complete 1–1025 sequence and endpoints, API-independent official slides, recent same-currency price ranking, pinned card identity, shared-card membership and reviewed provenance, gesture cancellation/momentum, source pagination, artist credit/membership admission, portfolio cancellation/retry/scroll state, stateless API behavior and server validation. `npm run build` runs TypeScript validation and creates production assets.

For an explicit live, read-only discovery check, run `node scripts/check-live-discovery.js` against TCGdex, or add a deployed base URL to verify that deployment. It checks the exact species denominator and a usable first page for Bulbasaur, Pikachu and Dragapult. This network check is separate from deterministic `npm test`.

Browser QA checklist:

1. Load a fresh session: #001 Bulbasaur appears. Swipe/scroll up to #002 Ivysaur and #003 Venusaur; reverse back to #001. Scrolling above #001 stays there.
2. Swipe left/right on a species with multiple editions. Confirm artwork and credit change together; later discovery must not replace a manually chosen edition.
3. Search for #1025, open Pecharunt, and verify the last-species control is disabled. Search back to #001 without changing feed order.
4. Try all arrow keys, Page Up/Down, Home/End and visible buttons. Focus should remain visible. Verify intermediate horizontal displacement, partial release, native snapping and immediate reversal; settled artwork and credit must match. Do not assume hardware momentum is one page per gesture.
5. Open details, scroll its complete content, change currency, select a thumbnail, and close using the button, Escape and backdrop. Feed position should stay put. Follow an artist, load another page, and open a card absent from the initial session; its exact identity must be retained. Return through its artist credit and verify the portfolio scroll position. Close mid-request and change artists; stale results must not appear in the wrong gallery.
6. Filter search by type and saved species. Save/reload/unsave and verify local persistence. No favorite API writes should occur.
7. Block API calls and reload. All species must remain scrollable with correctly labeled official artwork. Break an image URL: retain its identity and show an unavailable state rather than attaching a different image to its credit.
8. Check widths 320, 390 and 1280, short landscape viewports, increased text size, reduced motion, touch pinch zoom and real-device swipes. Main artwork must remain uncropped; source drawers must scroll without moving the feed.

Automated checks do not claim physical-device or screenshot verification. The parent task verifies the deployed preview in its browser before delivery.

## Bounded discovery and 3D

The next discovery candidate prepares near the gallery edge. It never selects itself. At most one request and one candidate image prepare at a time; cancellation ignores stale responses, a 15-second deadline exposes Retry, and unavailable source pages retain their cursor. Exhaustion means the checked finite sources, not every Pokémon artwork in existence.

3D admission is explicit in `content/models/admitted.json`, separate from the source availability manifest. The initial transfer cap is 750 KB. It does not establish a GPU-memory or visual-quality budget. Only the active admitted model fetches/decodes; neighbor preparation uses ordinary posters. Source bytes must match their recorded size and Git blob identity before decoder allocation. A 12-second deadline, bad bytes or renderer failure select official art. The runtime is lazy, cached models are disabled and unmounted scenes are disposed by the viewer. Inspect enables rotation; Done restores focus and feed position, without creating a history entry.

See [model source provenance](docs/pokemon-model-sources.md). Availability is 971/1,025 species, not rights clearance or phone performance evidence. Embedded attribution claims and missing mappings remain explicit. The repository MIT license does not clear underlying Pokémon IP. Only the geometry-preserving 141 KB Mewtwo candidate is admitted after representative browser rendering and Inspect checks. Every other model remains unadmitted; Gholdengo failed visual assessment. This is one admitted model, not complete 3D coverage.

## Search and release

Tap search or the dex number to jump by name or national number (`150`, `#150`, padded forms). The Random button directly below the dex number chooses another species from the full national dex only when clicked, preserving normal species URL and excursion-history behavior. Type, generation and saved filters disclose through Filters and removable chips. Recent picks stay private to this browser and are capped at eight; search never reorders the vertical dex.

Follow the [preview → review → mirror release flow](docs/release-flow.md). Review the exact Ready build before main/domain cutover, then verify both custom domains serve the tested build.
