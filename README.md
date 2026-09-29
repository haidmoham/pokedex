# pokédex

a small full stack pokédex with a card-art museum, search, type filters, and saved favorites.

## run locally

requires node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

open <http://127.0.0.1:5173>. vite serves the react app and proxies `/api` to express on port 3001.

```sh
npm test
npm run audit:cards
npm run build
npm start
```

`npm start` serves the built app and api from port 3001. set `PORT` and `DATA_FILE` to change the server port and favorites file. the default favorites file is `data/favorites.json`, which is gitignored. the species catalog is in `server/catalog.js`.

## card editions and artist credits

The API reads from [`content/cards.json`](content/cards.json), a checked snapshot. It does not look up or guess artist credits at request time. Every shown card binds its Pokédex ID, exact card title, set, collector number, language, artist spelling, image source, and evidence to one manifest record.

Admission requires a TCGdex card record plus a matching artist credit on an exact Pokémon TCG card page or visibly printed on the card scan. Publisher pages reviewed through indexed text are labeled as such because direct fetches can be blocked. Other records cite the inspected printed scan. Unknown or mismatched credits stay out of the API. `npm run audit:cards` rechecks TCGdex identity and credit fields, image URLs, PNG dimensions, and the recorded SHA-256 hashes. It also prints the exact species coverage.

The current snapshot has 23 card editions across all 19 Pokédex species. Dragapult has four, Gengar has two, and each of the other 17 species has one checked edition. The 600px TCGdex scans are displayed at no more than 300 CSS pixels where the layout allows. Card images load from the recorded remote host and need a network connection; the metadata and artist browsing come from the local snapshot. Card art rights are separate from the source code in this repository. No scan files are committed.

## experience notes

The species index is the Pokédex entry. Selecting a species opens an image-led card museum. Each card keeps its artist plaque, exact edition details, and citations together. Selecting an artist opens the checked cards by that illustrator across species.

The species feed starts with Dragapult and Gengar, then keeps all remaining catalog species available in dex order. On the card surface, swipe or scroll vertically (or use ↑ / ↓) to change species; swipe or scroll horizontally (or use ← / →) to change card editions. Both axes loop. Previous/next species buttons and card buttons provide alternatives. The last selected card is remembered for each species and artist during the session. Outside the card surface, normal page scrolling remains available; pinch zoom is preserved. Artist galleries keep vertical page scrolling and only use horizontal card navigation.

Multi-card galleries also support thumbnail selection. Single-card collections show their count without idle arrow buttons. Species sprites are labeled separately and do not receive card-illustrator credits. See [`docs/experience-contract.md`](docs/experience-contract.md) for the display and evidence gates.

## deployment

railway builds `haidmoham/pokedex` from `main` using [`railway.json`](railway.json). one express service serves the frontend and API. production uses `PORT=3001`, `NODE_ENV=production`, and `DATA_FILE=/data/favorites.json`, with a persistent volume mounted at `/data`.

the intended public address is <https://pokedex.shin86.dev>. favorites are a shared collection in this prototype, with no user accounts. artist metadata is committed with the app; card images remain hosted by their recorded source.

## navigation verification

`npm test` includes axis classification, pointer cancellation, repeated and interrupted
wheel gestures, momentum suppression, and wrapping regression tests. `npm run build`
runs TypeScript validation and builds production assets.

For a browser check, run `npm run dev` and open the local URL:

1. Open Dragapult. Swipe left/right on the card; confirm the image, edition and artist change together.
2. Swipe up to Gengar; swipe down to return. Confirm Dragapult's selected edition is retained.
3. Try diagonal movement, a cancelled pointer gesture, and a long trackpad momentum tail. Each deliberate gesture should move at most one axis once.
4. Use all four arrow keys, species/card buttons and thumbnails. Tab through the artist and evidence links; the focus ring must stay visible.
5. Follow an artist and return. Vertical scrolling in the artist gallery must scroll the page rather than change a card.
6. Return to the index, search/filter, and save a species. All 19 catalog species remain accessible. Favorites are shared in this prototype; use a disposable local `DATA_FILE` for testing.
7. Check widths 320, 390 and 1280, increased text size, reduced motion, touch pinch zoom and a real mobile device. Swipe only on the card surface; surrounding text must still scroll.

Browser and real-device QA are required before calling this slice production-ready.
