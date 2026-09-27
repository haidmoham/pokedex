# pokédex

a small full stack pokédex with a gallery view, search, type filters, and saved favorites.

## run locally

requires node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

open <http://127.0.0.1:5173>. vite serves the react app and proxies `/api` to express on port 3001.

```sh
npm test
npm run build
npm start
```

`npm start` serves the built app and api from port 3001. set `PORT` and `DATA_FILE` to change the server port and favorites file. the default favorites file is `data/favorites.json`, which is gitignored. the catalog is a deliberately small local selection in `server/catalog.js`. artwork loads from [pokéapi sprites](https://github.com/PokeAPI/sprites).

## design notes

the gallery uses a featured specimen, neighboring previews, a thumbnail rail, and an overview. these adapt the multiple-navigation idea observed in the creator's wintery gallery to a small catalog. search, type, favorites, and keyboard arrows all operate on the same visible selection.
