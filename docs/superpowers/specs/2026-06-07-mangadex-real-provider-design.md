# MangaDex Real Provider Design Spec

**Date:** 2026-06-07
**Status:** Superseded (2026-10-13). Implemented during the web-first recovery —
see `docs/recovery/spec.md`. Deviations from this document: no Zod dependency
(hand-rolled narrow validators), the package lives at `packages/extensions-mangadex`,
and the `dev-mangadex-*` scaffold this spec replaces was deleted in S3b.
**Scope:** Replace the `apps/web/app/lib/dev-mangadex-*` dev hacks with a proper `@app/extensions-mangadex` provider package, validate MangaDex API responses with Zod, route provider calls through TanStack Query, and auto-install MangaDex as a first-party provider on first DB init.

## Problem

The web app ships a "dev-only" MangaDex integration under `apps/web/app/lib/dev-mangadex-*.ts`. The integration is gated on `import.meta.env.DEV`, uses raw `fetch` with no runtime validation, and bypasses the `@app/extensions-core` install flow. The reported symptom is that the reader renders an empty chapter for users who click a MangaDex manga. The root causes are:

1. `mapMangaDexChapterEntity` (`apps/web/app/lib/dev-mangadex-search.ts:498`) always persists chapters with `pages: []` and never populates them from the chapter feed.
2. `hydrateDevReaderChapterIfNeeded` (`apps/web/app/lib/dev-mangadex-reader.ts:51`) lazily fetches pages from `/at-home/server/{chapterId}` only on the first chapter open. If the call fails, returns an empty payload, or returns a shape the code does not expect, the chapter persists as `pages: []` and the reader renders the `<EmptyState type="no-chapters" />` branch at `packages/reader/src/components/ReaderScreen.tsx:250`.
3. There is no runtime validation, so a MangaDex API change surfaces as a silent empty result.
4. Network calls bypass TanStack Query, so retries, cancellation, and the existing query cache are not used.
5. The auto-seed (`seedDevMangaDexProvider`) only runs in dev mode, so a production build never gets MangaDex.

The architecture documents in `docs/ARCHITECTURE.md` and `docs/PLAN.md` already prescribe the correct shape: providers live in dedicated packages, declare a typed contract via `@app/extensions-sdk`, are installed through `@app/extensions-core`, and are invoked through `@app/extensions-core` and feature packages — never through one-off raw fetch calls in the app shell.

## Goal

Ship a `packages/extensions/mangadex/` provider that conforms to `@app/extensions-sdk`'s `ProviderContract`, validates every MangaDex API response with Zod, is auto-installed as a first-party provider on first DB init, and is consumed by the web app through TanStack Query options in `apps/web/app/queries/`. The reader must reliably render pages after one successful open, and the same chapter must reopen with zero MangaDex API calls.

## Non-Goals

- Other providers. We set the pattern; a second provider gets its own spec.
- MangaDex authentication (login, logout, session tokens).
- Adaptive backoff from MangaDex rate-limit headers beyond the SDK's built-in rate limiter.
- Webtoon-only or long-strip optimizations in the reader.
- Cloud sync (Phase 12 in `docs/PLAN.md`).
- Any change to themes, motion, or reader UX.
- New `PageLayoutMode` values, new tap-zone geometries, or reader performance changes.

## Approach

**Approach C from the brainstorming: registry + queryOptions in the web app.** The provider package owns the contract, Zod schemas, and the API client. The web app wraps each provider method in TanStack Query `queryOptions` and resolves the installed provider through a `provider-registry` helper. MangaDex is auto-installed on first DB init using the existing `@app/extensions-core` install flow.

Three alternatives were considered and rejected:

- **A — Pure registry with Query inside the provider.** All caching lives inside the provider package. Rejected: hides the query layer from feature code and breaks the existing `apps/web/app/queries/` convention.
- **B — Direct provider import.** Bypasses the install flow. Rejected: breaks the future "switch provider for a manga" UX and the registry concept.
- **C (chosen) — Registry + web app queryOptions.** Provider is pure contract + Zod + client. Web app wraps with `queryOptions`. Matches existing convention, sets the pattern for future providers, and gives TanStack Query full control over caching/cancellation/retries.

## Package Layout

```
packages/extensions/mangadex/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md                         # how to record fixtures, how to run live smoke
  src/
    index.ts                        # public surface
    manifest.ts                     # MANGADEX_MANIFEST
    provider.ts                     # createMangaDexProvider + contract methods
    schemas/
      manga-search.ts
      manga-detail.ts
      chapter-feed.ts
      at-home.ts
      shared.ts                     # shared atoms: titleMap, relationship, contentRating
    api/
      request.ts                    # URL builders + createProviderRequestClient
      parse.ts                      # Zod parse + normalized error mapping
    mapping/
      to-manga-identity.ts
      to-chapter.ts
      to-page.ts
    fixtures/
      manga-search.json
      manga-detail.json
      chapter-feed.json
      at-home.json
    tests/
      schemas.test.ts               # one per schema, against fixtures
      provider-contract.test.ts     # runProviderContractTests via fixtureFetch
      live-smoke.test.ts            # gated by MANGADEX_LIVE=1
```

The package depends on `@app/extensions-sdk`, `@app/shared`, and `zod`. It must not depend on `@app/db`, `@app/platform`, or any app-shell code.

## Provider Contract

The provider is a `defineProvider` instance from `@app/extensions-sdk`. Methods that this spec implements:

- `search(ctx, input)`
- `browseLatest(ctx, input)`
- `browsePopular(ctx, input)`
- `getDetails(ctx, mangaId)`
- `getChapters(ctx, mangaId)`
- `getPages(ctx, mangaId, chapterId)`
- `getRecommendations(ctx, mangaId)`

Methods deliberately out of scope for v1: `advancedSearch`, `getRelatedTitles`, `getTags`, `login`, `logout`, `getDownloadInfo`. The manifest must not declare capabilities for these so the contract test enforces the boundary.

The `createMangaDexProvider` factory accepts:

```ts
{
  fetchImpl?: typeof fetch;        // for tests
  rateLimiter?: RateLimiter;        // from @app/extensions-sdk
  signal?: AbortSignal;             // propagated from Query
}
```

It returns a frozen `ProviderContract`. Default rate limit: 1.5s spacing between MangaDex API calls (MangaDex publishes 5 req/s).

## Zod Schemas

Each MangaDex endpoint has its own Zod schema. Schemas are strict enough to catch shape drift but tolerant of optional fields. Each schema exports a parser and an inferred type. Schemas live next to the provider (per the user's preference) and are not shared with other providers.

Coverage:

- `MangaDexMangaSearchResponse` — `/manga?title=...&includes[]=cover_art`
- `MangaDexMangaDetailResponse` — `/manga/{id}?includes[]=cover_art&includes[]=author&includes[]=artist`
- `MangaDexChapterFeedResponse` — `/manga/{id}/feed?order[chapter]=asc&translatedLanguage[]=en`
- `MangaDexAtHomeResponse` — `/at-home/server/{chapterId}`

Shared atoms in `schemas/shared.ts`:

- `MangaDexTitleMap = z.record(z.string())`
- `MangaDexRelationship = z.object({ type, id, attributes })`
- `MangaDexContentRating = z.enum(['safe', 'suggestive', 'erotica', 'pornographic'])`

A Zod parse failure surfaces as a normalized error with a new code `extensions.sdk.zod.parse_failed` (added to `@app/extensions-sdk` errors) carrying the failing Zod path and endpoint. The web app treats this as a partial-failure: the query returns an empty result with a warning, the UI shows "MangaDex unavailable" instead of an empty screen.

## Local-First Page Flow

1. **Manga detail open.** `manga.$id.tsx` calls `mangadexMangaDetailQueryOptions(db, mangaId)`. The query resolves the installed provider, calls `getDetails` and `getChapters`, maps to `MangaIdentity` and `Chapter[]`, and persists via `upsertMangaIdentity` + `upsertChapterWithPages` (with `pages: []`).
2. **Chapter open.** `reader.$chapterId.tsx` calls `mangadexChapterPagesQueryOptions(db, chapterId)`. The query resolves the provider, calls `getPages`, gets `readonly ProviderPage[]` (image URLs from `/at-home/server/{id}`), and persists them via `upsertChapterWithPages` so the next open is instant. `ReaderScreen` continues to call `prefetchChapterPages` from `@app/cache`, which downloads the images into the local page cache. `CachedPageImage` renders the local blob URL.
3. **Reopen.** `chapter_pages` is populated. `getPages` runs but is a no-op fast call (MangaDex cached). `prefetchChapterPages` short-circuits because the cache entries exist. Zero MangaDex API calls after the first open.
4. **Offline reopen.** Same as (3). The reader renders entirely from the page cache.
5. **Cache eviction.** `@app/cache` gains a `runCacheMaintenance(db, adapter, { coverLimitMb, pageLimitMb })` helper. It unifies the existing `runCoverCacheMaintenance` with a new `runPageCacheMaintenance` using the same LRU strategy. The cover cache bridge in `apps/web/app/providers/cover-cache-bridge.tsx` calls it on a debounced timer.
6. **Failure paths.**
   - Zod parse failure → empty result with `warning` in the normalized error.
   - `/at-home/server/{id}` 404/503 → reader renders with whatever pages exist; a "Retry" button is shown in chrome.
   - Offline on first open → TanStack Query retries once with `networkMode: 'offlineFirst'`; reader shows the empty state with a "Retry" button.

## Web App Wiring

**1. First-party auto-install.**

- New file `apps/web/app/lib/first-party-providers.ts` lists first-party provider manifest URLs. Initial list contains only the MangaDex URL.
- Vite is configured to copy `packages/extensions/mangadex/manifest.json` into both the web and Electron bundles as a static asset served at `/providers/mangadex/manifest.json`. The manifest's `source.manifestUrl` is rewritten at dev/build time so it points to the served URL (e.g., `http://localhost:5173/providers/mangadex/manifest.json` in dev, a relative path in production).
- `LocalDbProvider` calls a new `installFirstPartyProviders(db)` helper. The helper fetches each manifest URL, runs it through the existing `prepareManualExtensionInstall` + `confirmExtensionInstall` flow from `@app/extensions-core`, and is a no-op if the provider is already installed. The `import.meta.env.DEV` gate is removed.
- `seedDevMangaDexProvider` is deleted.

**2. Provider resolution.** New helper `apps/web/app/lib/provider-registry.ts` exposes `resolveInstalledProvider(db, providerId)`. It looks up the installed extension manifest and returns the right `ProviderContract` factory. MangaDex returns `createMangaDexProvider({})`. Future providers add their own branch.

**3. Query options.** New file `apps/web/app/queries/mangadex-query-options.ts` exports the key factory and one `queryOptions` builder per provider method used by the routes:

```ts
export const mangadexQueryKeys = {
  all: ['mangadex'] as const,
  search: (q: string, lang: string) =>
    [...mangadexQueryKeys.all, 'search', q, lang] as const,
  detail: (mangaId: MangaId, lang: string) =>
    [...mangadexQueryKeys.all, 'detail', mangaId, lang] as const,
  pages: (chapterId: ChapterId) =>
    [...mangadexQueryKeys.all, 'pages', chapterId] as const,
  discover: (lang: string) =>
    [...mangadexQueryKeys.all, 'discover', lang] as const,
};

export function mangadexMangaDetailQueryOptions(db: AppDrizzleDb, mangaId: MangaId) { /* getDetails + getChapters, persist via @app/db */ }
export function mangadexChapterPagesQueryOptions(db: AppDrizzleDb, chapterId: ChapterId) { /* getPages, persist chapter_pages */ }
export function mangadexSearchQueryOptions(db: AppDrizzleDb, query: string) { /* search */ }
export function mangadexDiscoverSectionsQueryOptions(db: AppDrizzleDb) { /* browseLatest + browsePopular + getRecommendations */ }
```

`mangadexMangaDetailQueryOptions` is the only `queryOptions` that calls `getDetails` and `getChapters` together; the chapter feed is not exposed as a separate query.

All use `staleTime` / `gcTime` / `retry` from the existing `apps/web/app/queries/query-timing.ts`.

**4. Route changes.**

| Route | Today | After |
|---|---|---|
| `discover.tsx` | `fetchDevMangaDexSection*` | `mangadexDiscoverSectionsQueryOptions` + `useInfiniteQuery` |
| `manga.$id.tsx` | `fetchDevMangaDetail` | `mangadexMangaDetailQueryOptions` + existing `fetchMangaDetail` |
| `reader.$chapterId.tsx` | `hydrateDevReaderChapterIfNeeded` | `mangadexChapterPagesQueryOptions` |
| `search.tsx` | `fetchDevMangaDexSearchResults` | `mangadexSearchQueryOptions` |
| `extensions.tsx` | `getDevMangaDexManifestUrl` | new first-party manifest URL helper |
| `extensions.$providerId.tsx` | unchanged | unchanged |
| `LocalDbProvider` | `seedDevMangaDexProvider` | `installFirstPartyProviders` |

A `VITE_USE_REAL_MANGADEX` feature flag is honored by each route during migration so a route can be flipped to the new path independently. The flag is removed when the dev files are deleted.

**5. Files to delete.** `dev-mangadex-search.ts`, `dev-mangadex-reader.ts`, `dev-mangadex-persist.ts`, `dev-seed-mangadex.ts`, `scripts/mangadex-dev/manifest.template.json`, `scripts/mangadex-dev/provider.template.mjs`, the Vite middleware in `apps/web/vite.config.ts` that served `/__dev/providers/mangadex/manifest.json`, and `apps/web/e2e/fixtures/mangadex.ts`.

**6. Shared LRU cache helper.** New `runCacheMaintenance(db, adapter, { coverLimitMb, pageLimitMb })` in `@app/cache` that unifies cover and page cache eviction. Called from the cover bridge and from the reader's prefetch flow.

## Testing Strategy

**1. Zod schema tests.** One test file per schema. Each one runs the parser against the recorded fixture (positive case) and against a hand-written broken shape (negative case). Schema names match the endpoint URL.

**2. Provider contract tests.** `provider-contract.test.ts` uses `runProviderContractTests` from `@app/extensions-sdk` against `createMangaDexProvider({ fetchImpl: fixtureFetch })`, where `fixtureFetch` returns recorded fixtures for known MangaDex URLs and 404s otherwise. Asserts the contract is valid and the required methods succeed against fixtures.

**3. Live smoke test.** `live-smoke.test.ts` is gated by `MANGADEX_LIVE=1`. It hits real MangaDex with a documented well-known manga and runs `search`, `getDetails`, `getChapters`, `getPages`. Skipped in CI by default. Run before releases or when fixtures are refreshed.

**4. Query options tests.** `apps/web/app/queries/__tests__/mangadex-query-options.test.ts` mocks the provider factory and asserts each `queryOptions` returns the right shape, the right keys, and triggers the right side effects (DB upsert, page cache write).

**5. E2E.** `apps/web/e2e/catalog-flows.spec.ts` updates its `__dev` manifest route to the new first-party URL. A new read-flow e2e asserts: open `/discover` → click manga → `/manga/$id` shows chapters → click chapter → reader renders pages from fixtures and `EmptyState type="no-chapters"` is never shown.

**6. Fixture recording.** `packages/extensions/mangadex/scripts/record-fixtures.ts` (run via `pnpm --filter @app/extensions-mangadex mangadex:record-fixtures`) hits MangaDex with a documented manga and writes JSON into `src/fixtures/`. Documented in the package README. CI does not run it; contributors run it locally and commit the new fixtures.

## Migration Order

Each step keeps the app working.

1. **Scaffold the new package** with config, vitest, exports, and an empty `defineProvider` stub matching the manifest. No route changes.
2. **Add Zod schemas** for the four endpoints, plus fixture tests against recorded fixtures.
3. **Implement provider contract methods** in `provider.ts` using schemas, mapping, and `@app/extensions-sdk`'s request client.
4. **Add package's own contract test** using `runProviderContractTests` + a `fixtureFetch`. Add the `MANGADEX_LIVE`-gated live smoke test.
5. **Add web app `queryOptions`** in `apps/web/app/queries/mangadex-query-options.ts` and `mangadexQueryKeys`.
6. **Add first-party auto-install:** `first-party-providers.ts`, Vite asset pipeline, `installFirstPartyProviders(db)` helper, call from `LocalDbProvider`.
7. **Route migrations, one route at a time.** `reader.$chapterId.tsx` first (fixes the reported empty reader). Then `manga.$id.tsx`, then `discover.tsx` and `search.tsx`. Each route keeps its old behavior behind `VITE_USE_REAL_MANGADEX` until the new path is verified.
8. **Delete dev files** once each route is migrated. The Vite `/__dev` middleware, the `scripts/mangadex-dev/*` templates, and `apps/web/e2e/fixtures/mangadex.ts` go with them.
9. **Add shared LRU cache helper** in `@app/cache` and wire it from the cover bridge and from the reader's prefetch flow.
10. **Update e2e** to use the new manifest URL and add the read-flow e2e test.

## Acceptance Criteria

- A fresh `pnpm dev:web` install shows MangaDex auto-registered in the Extensions page without any user action.
- From `/discover`, clicking any section card opens `/manga/$id` which loads chapters via `mangadexMangaDetailQueryOptions` (the section card previews and the detail page read from the same query cache after the first detail load).
- Clicking a chapter navigates to `/reader/$chapterId` and renders page 1 through `CachedPageImage` (local blob URL).
- Killing the network and reloading the same chapter still renders the pages.
- Reopening the same chapter triggers zero MangaDex API calls (verifiable in DevTools Network tab).
- `pnpm test` is green; new contract tests pass against fixtures; new queryOptions tests pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` are green.
- `dev-mangadex-*` files, the Vite `/__dev` middleware, and `scripts/mangadex-dev/*` are removed.
- `docs/ARCHITECTURE.md` and `docs/PLAN.md` are updated to reflect that MangaDex is now a first-party provider via the extension install flow (not a dev hack).
- No `EmptyState type="no-chapters"` ever appears for a chapter the user has successfully opened once.

## Risks

- **Zod parse failures show as user-visible "MangaDex unavailable" states.** Mitigated by the live smoke test catching drift early and the fixture-recording workflow.
- **First-party manifest URL must agree between Vite and Electron.** Mitigated by writing the manifest into a known asset path that both bundles can serve.
- **Existing dev DBs have chapters with no `chapter_pages` rows.** The reader's `mangadexChapterPagesQueryOptions` repopulates them on the next open. Acceptable.
- **Zod bundle size.** Zod is already used widely in the ecosystem; the four schemas add well under 10 KB minified. Acceptable.

## Open Questions

- Should the auto-install run on every app start, or only on first init? Current design: every start, but the install is a no-op when the provider is already registered. Confirm during implementation.
- Should `browseLatest` / `browsePopular` respect the user's `translatedLanguage` setting? Current design: hardcoded `en` to match the existing dev behavior. Future enhancement.
- Should the manifest be versioned in the package (e.g., `0.2.0`) and bumped on schema changes, or follow a `date` versioning scheme? Current design: semver, bumped on contract changes. Confirm during implementation.
