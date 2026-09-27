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

Multi-card galleries loop through the audited editions with arrow buttons and keys, horizontal drag or swipe, wheel or trackpad movement, and thumbnail selection. Single-card collections show their count without idle arrow buttons. Species sprites are labeled separately and do not receive card-illustrator credits. See [`docs/experience-contract.md`](docs/experience-contract.md) for the display and evidence gates.
