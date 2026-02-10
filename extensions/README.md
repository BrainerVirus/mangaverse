# MangaVerse Extensions

This folder contains sample extension sources and the extension repo index used for local
development. Extensions are authored in ESM and bundled into a runtime-safe JS file that
the app can load. Bundles are checked in under `extensions/dist/` for convenience.

## Files
- `extensions.json` — extension repository index
- `mangadex/` — MangaDex ESM source
- `tumangaonline/` — TuMangaOnline (ZonaTMO) ESM source

## Bundle format
The app runtime expects a CommonJS-style bundle that sets `module.exports` to a provider
contract implementation. Use a bundler to compile the ESM source into that format.

## Example bundling (rollup)
```
npm run extensions:build
```

This will produce `dist/mangadex.js` and `dist/tumangaonline.js` which can be referenced
in `extensions.json`.
