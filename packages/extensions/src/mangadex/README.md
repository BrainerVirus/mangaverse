# @app/extensions/mangadex

First-party MangaDex provider for MangaVerse. Implements the
`@app/extensions-sdk` `ProviderContract` against the official MangaDex API:
search, latest/popular browse, details, chapter feed and page URLs.

Capabilities declared in `manifest.ts` are exactly the methods implemented;
the SDK contract test (`provider-contract.test.ts`) enforces that boundary.

## Tests

- `pnpm --filter @app/extensions test` — schema, mapping and contract
  tests run against recorded fixtures in `fixtures/` (no network).
- Live smoke (opt-in): `MANGADEX_LIVE=1 pnpm --filter @app/extensions test`.
  Hits the real API with a documented search; skipped in CI by default.

## Recording fixtures

Fixtures were captured from the live API (search, detail, feed, at-home) for one
manga. To refresh them, re-run the same requests and replace the JSON files:

```sh
BASE=https://api.mangadex.org
MANGA_ID=<manga-uuid>
curl -s "$BASE/manga?title=berserk&limit=1&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive" > fixtures/search.json
curl -s "$BASE/manga/$MANGA_ID?includes[]=cover_art&includes[]=author&includes[]=artist" > fixtures/detail.json
curl -s "$BASE/manga/$MANGA_ID/feed?limit=2&translatedLanguage[]=en&order[chapter]=asc" > fixtures/feed.json
curl -s "$BASE/at-home/server/<chapter-uuid>" > fixtures/at-home.json
```

Payload drift is a hard error (`extensions.mangadex.payload_invalid`), never a
silently empty result — the reader must never render an empty chapter because a
response changed shape.
