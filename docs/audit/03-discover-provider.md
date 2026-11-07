# 03 - Discover and provider audit

Auditor: discover/provider. Read-only, no source edits.
Worktree `ui-loaders-audit`, branch `bugfix/app-flow-audit`, main `0c96b79e`.

Evidence labels used below:

- **[Reproduced]**: I ran it and saw the behavior.
- **[Code]**: established by reading the code or by a test I wrote, ran, then deleted.
- **[Hypothesis]**: plausible and not proven. The Windows items are all this, because I have no Windows machine.

## 0. Summary

| #   | Finding                                                                                                                                                                                                                                   | Sev    | Label                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| B1  | One failed section is dropped with no indicator, no retry and no auto-retry.                                                                                                                                                              | High   | Reproduced              |
| B2  | A failed expanded section, especially page 2+, replaces the whole page with "Could not load discover feed". It hides the loaded results and the Back button.                                                                              | High   | Reproduced              |
| B3  | A 429 left a skeleton up for 56 seconds in the fixture; a hung request took about 63 seconds to reach an error.                                                                                                                           | High   | Reproduced              |
| B4  | Every desktop transport failure (timeout, TLS, proxy, DNS, allowlist block) becomes `extensions.sdk.unknown` "An unexpected error occurred." The node hop discards the errno, so a Windows log cannot say why.                            | High   | Code (test run)         |
| B5  | "Only 2 sections" is the designed ceiling, not a runtime bug. The contract, the manifest, the registry types and the UI copy all cap Discover at Latest and Popular. Genres, recently added, top rated, seasonal and others do not exist. | -      | Code                    |
| B6  | The provider's `defaultSort` setting overrides every section's own order. With a default sort set, Latest and Popular show the same list.                                                                                                 | Medium | Code (test locks it in) |
| B7  | The error copy is static. A local-DB failure and a provider failure show the same "Provider catalog failed to load".                                                                                                                      | Medium | Reproduced and Code     |
| B8  | If the app-settings read fails, the feed query stays disabled forever, and the user sees the "Browse providers" empty hint.                                                                                                               | Medium | Code                    |
| B9  | Provider tab and URL can disagree after history navigation. The expanded-section query keeps running for a provider whose tab is not shown. This is latent, because only one provider has a binding.                                      | Low    | Code                    |
| B10 | MangaDex paging breaks at offset 9984+24 > 10000 (HTTP 400). The code only trusts `total`.                                                                                                                                                | Low    | Verified live           |
| B11 | Previews fetch 24 titles to show 6. In-flight IPC provider requests are not cancelled on abort. The renderer rate gate resets on reload.                                                                                                  | Low    | Code                    |

The Windows report cannot be attributed without its error and network evidence. Plausible explanations include:

- An H1-H3 network failure (section 6) that B4 makes undiagnosable.
- A partial feed from B1, which looks like "only 2 sections, then fewer".

## 1. Observed and reproduced bugs

### Method

- Vite dev server on `127.0.0.1:5199`, driven by Playwright from `/tmp/audit03/*.mjs`.
- `page.route` replaced `api.mangadex.org` with the repo's recorded fixture.
- Onboarding was completed with "Finish without provider". The first-party MangaDex install is automatic, and the Discover tab strip shows `["MangaDex"]`.
- Real Electron was not run. Another auditor was driving the shared `apps/desktop/dist`.
- The desktop path was exercised in two ways:
  - The production `nodeRequestHop` was run directly in a throwaway vitest test, since removed. It went against live MangaDex and a local self-signed TLS server.
  - The renderer error mapping was run in another throwaway test, since removed.
- The desktop E2E fixture transport swaps `nodeRequestHop` for `fetch` (`apps/desktop/src/main/provider-network-fixture.ts`). The existing `main-process-fetch.test.ts:410` also exercises the real hop with local HTTP; neither establishes packaged Windows HTTPS, TLS interception, proxy or system-CA behavior.

### B1 - Section failure is silently dropped [Reproduced]

**Code**

- `apps/web/app/queries/provider-discover.ts:152-190`
  - `Promise.allSettled` over the sections.
  - Rejections are pushed to `failures` (180-182) and never returned.
  - Fulfilled-but-empty sections are filtered at 190.
- `provider-discover.ts:201-203` throws only if the failed sections left nothing at all.
- `provider-discover.ts:45-47` and `:56-58`: `fetchSection` returns `null` for an unknown section or a missing browse method, which also reads as "empty".
- `DiscoverPage.tsx:68-70`: an empty section renders `null`.
- `apps/web/app/queries/__tests__/provider-discover.test.ts:149-160` asserts "one section fails -> the healthy section still shows". That test locks in the missing indicator.

**Steps** (`s1-baseline.mjs popular500`)

1. Complete onboarding, then open `/discover`.
2. Make `order[followedCount]` return 500 and `order[latestUploadedChapter]` return 200.

**Expected**: SPEC.md:367-390 asks for "Empty, loading, error, and partial failure states" and "Independent retry for failed providers". The user should see "Popular couldn't load" with a Retry.

**Actual** (1.3s: `latest 200`, `popular 500`; stable at 11.5s)

```json
{
  "headings": ["Latest updates"],
  "errorState": false,
  "retryBtn": false,
  "toasts": [],
  "alerts": []
}
```

- The page looks complete, with one section.
- The query function resolved, so TanStack's `retry: 1` never fires. There is exactly one failed request and no retry.
- No section-specific retry is offered. A later whole-feed refetch, for example a stale query remount or invalidation, can recover it.
- On real networks a transient 429, 5xx or timeout on one of the two sections turns "2 sections" into 1.

### B2 - Expanded-section failure takes over the page [Reproduced]

**Code**

- `routes/discover.tsx:101-129`: `useInfiniteQuery`.
- `routes/discover.tsx:156`: `isError` is `sectionQuery.isError`.
- `routes/discover.tsx:215`: `isError={dbStatus === 'error' || isError || isSectionError}`.
- `DiscoverPage.tsx:265`: `DiscoverProviderBrowser` returns `null` when `isError`.
- `DiscoverPage.tsx:204-210`: `ErrorState` is rendered without `onBack`, although `error-state.tsx:19-45` supports it.
- In TanStack v5 a failed `fetchNextPage` leaves `data` but sets `status = 'error'`, so `isError` is true.

**Steps** (`s2.mjs page2`)

1. Open `/discover` and click "See all" on Popular. Page 1 (offset 0) returns 200.
2. Scroll. Offset 24 returns 500. TanStack retries it once, so there are two offset-24 calls.

**Expected**: the loaded titles stay, with an inline "couldn't load more, Retry" row and the Back button still visible.

**Actual**

```json
{
  "url": "/discover?provider=mangadex&section=popular",
  "headings": [],
  "errorState": true,
  "tabs": [],
  "expanded": false,
  "retryBtn": true
}
```

- The entire Discover body (tab strip, loaded grid, "Back to discover") is replaced by `Could not load discover feed / Provider catalog failed to load`.
- The title says "feed" for a pagination error.
- The only exit is Retry or the browser Back button.
- Retry calls `sectionQuery.refetch()`, which refetches loaded pages. In my run offset 0 was refetched, then the visible infinite-scroll sentinel caused offsets 24–288 to fire within 0.2s; that burst was not evidence that 13 pages had already been loaded. The fixture returned the same small page and a large total, keeping the sentinel visible. A long existing list can still incur a multi-page refetch.

### B3 - 429, slow and hung requests leave the skeleton up with no message [Reproduced]

**Steps** (`s2.mjs rate429`, `s2.mjs hold`)

- 429 case: both sections return 429 with `Retry-After: 25`.
- Hold case: both requests are held for 100s.

**Expected**: a bounded wait with an explanation, such as "MangaDex is limiting requests, retrying in Ns" or a typed error with Retry.

**Actual, 429** (`out-rate429.txt`)

- Only the two original 429s are ever sent. At t=56s, 54 seconds after the 429, no further request had been sent.
- The page showed `"loading":true` with the skeleton for the whole window: 4.3s, 9.3s, 19.3s, 31.3s, 46.3s, 56.3s.
- Mechanism: `retry: 1` (`providers/query-provider.tsx:62`) re-runs the query 1s later. The shared per-provider gate (`extensions-sdk/src/request-gate.ts:163-201`) holds the request, parked on the 429 horizon, and `MAX_AUTO_WAIT_MS` is 15 minutes. Nothing tells the UI.
- The delay is consistent with the 60s fallback when `Retry-After` is unavailable, but the harness did not capture the header as seen by the SDK, so the exact cause is unverified. A normal live 200 exposed headers; a real 429 was not observed.
- The gate reads only `retry-after`. Verify the actual headers and timing on a real 429 before attributing the fallback.

**Actual, hang**

| Time      | State                      |
| --------- | -------------------------- |
| 6s-46s    | `loading: true` (skeleton) |
| about 63s | error                      |

Timeline:

- The SDK default timeout is 30s (`mangadex/provider.ts:86`).
- The auto-retry follows 1s later.
- The second timeout is about 62s.

This fixture reached the generic error after about one minute. This is not a global worst-case bound: gate waits precede request timeouts and can extend it.

**Related** [Code]: `apps/web/app/lib/provider-fetch.ts:66-74` aborts only by racing. The IPC request keeps running in main, which has no cancel channel. Leaving Discover does not stop it.

### B4 - Desktop transport errors lose their meaning [Code, test run and deleted]

I mapped what each failure becomes after `provider-fetch.ts:75-77` (`throw new Error(result.error.message)`) and the SDK `normalizeProviderError`. Method: real `createMangaDexProvider` + real `createProviderFetch`, with the adapter's `providerNetwork.request` faked.

| Failure from main                                         | Error code                                | Message in Diagnostics log              | UI kind                                 |
| --------------------------------------------------------- | ----------------------------------------- | --------------------------------------- | --------------------------------------- |
| timeout (`platform.io-failed`)                            | `extensions.sdk.unknown`                  | "An unexpected error occurred."         | `provider-unavailable`                  |
| transport error (TLS, proxy, ECONNRESET all land here)    | `extensions.sdk.unknown`                  | same                                    | `provider-unavailable`                  |
| `network.blocked-url` (allowlist not synced)              | `extensions.sdk.unknown`                  | same                                    | `provider-unavailable`                  |
| `network.dns-failed`                                      | `extensions.sdk.unknown`                  | same                                    | `provider-unavailable`                  |
| HTTP 429                                                  | `extensions.sdk.request.http_error` (429) | "HTTP 429."                             | `rate-limited` (the only distinct path) |
| HTTP 200 with a non-JSON body (AV or captive-portal page) | `extensions.mangadex.payload_invalid`     | "MangaDex response was not valid JSON." | `provider-unavailable`                  |

- `recordProviderFailure` (`extensions/src/core/extension-logs.ts:81-112`) stores `code` and `message` only, never `cause`. A Windows user's provider log therefore says "An unexpected error occurred." for **every** network failure.
- At the root, `main-process-fetch.ts:373-378` is `req.on('error', () => fail(new NetworkFetchError('network.transport-error','Network request failed.')))`. The Node `err.code` (`CERT_*`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`) is thrown away.
- **Verified against the production hop** (node `https` + pinned lookup), outside Electron:
  - Live `api.mangadex.org`: 200 in 822ms through `fetchNetworkResponse`/`nodeRequestHop` on macOS.
  - A self-signed TLS server (a stand-in for an AV or corporate TLS interceptor):
    `{"name":"NetworkFetchError","code":"network.transport-error","message":"Network request failed.","hasCause":false}`
    which reaches the renderer as `platform.io-failed / "Network request failed."`.
  - With `HTTPS_PROXY` pointing at a dead proxy, the request still connected directly (200). So node `https` ignores proxy env.

### B6 - `defaultSort` overrides the section order [Code]

- `mangadex/provider.ts:65-69` `browseOrder(settings, fallback)` returns the setting's order when a sort is set.
- `provider.ts:160-182`: `params.set(browseOrder(settings, order), 'desc')`.
- `provider-settings.test.ts:91-98` asserts "browseLatest with `defaultSort: 'popular'` sends `order[followedCount]`".
- The setting is user-visible: `extensions/src/components/ProviderSettingsForm.tsx:304-316`, "How browse sections order titles before any filters."
- Effect: with Default sort = Popular, Discover's **Latest updates** and **Popular** show the same list. With Latest, same. Discover then looks like it has one section, duplicated.

### B7 - One error copy for everything [Reproduced and Code]

- `DiscoverPage.tsx:205-209` always says "Provider catalog failed to load. Try again in a moment."
- `routes/discover.tsx:215` also feeds `dbStatus === 'error'` into the same banner. A local-library failure is therefore reported as a provider failure.
- The app has a classifier (`@app/shared` `classifyAppError`, `app-feedback.ts` `failureMessage`) with `offline`, `rate-limited`, `provider-unavailable` and others, but Discover does not use it.
- The query meta is `{ feedback: { surface: 'inline' } }` (`routes/discover.tsx:193`), so the global `QueryCache.onError` only logs. No toast was observed; `alerts: []` was the harness snapshot, not a full accessibility audit.
- In the web 500 fixture, two sections times `retry: 1` produced **4 failed requests and 4 browser console resource errors**. Each non-aborted failure attempts a provider-log write; writes are best effort and were not independently counted. This is a possible explanation for the report, not identification of the user’s error.

### B8 - App-settings failure looks like "no providers" [Code]

- `routes/discover.tsx:190-195`: the feed is `enabled` only when `appSettingsQuery.isSuccess`.
- `routes/discover.tsx:215` ignores `appSettingsQuery.isError`.
- `shouldShowProviderHint` (162-170) is true when `!isLoading && !isError && providerCount === 0`.
- Result: a failed settings read shows `EmptyState type="no-results"` with "Browse providers". No error and no retry. Not reproduced; this follows directly from the code.

### B9 - Provider switch and URL desync [Code, latent]

- `routes/discover.tsx:178-180` holds `selectedProviderId` in `useState` once, from `search.provider`. A later URL change (history back/forward) does not update it.
- `DiscoverPage.tsx:179-182`: the expanded view only renders when `expandedSection.providerId === activeProviderId`.
- But `useExpandedSection` (`routes/discover.tsx:84-160`) keys its query on the URL, not the tab. So a section query for provider A can run, and fail, while provider B's tab previews are shown, and `isSectionError` still replaces B's page.
- Not reachable today. `provider-registry.ts:92-111` registers one binding (MangaDex), so the strip shows one tab and a "provider switch" cannot be driven from the UI. It becomes real with the second provider.

### B10 - 10,000-result window [Verified live]

- `GET /manga?limit=24&offset=10000&order[followedCount]=desc` returns HTTP 400: "Result window is too large, from + size must be less than or equal to: [10000] but was [10024]".
- `offset=9999&limit=1` returns 200 with `total: 95415`.
- `provider.ts:128-149` sets `hasMore` from `total` only. The 417th page (offset 9984, limit 24) therefore 400s, and B2 then replaces the page.

### B11 - Waste and resets [Code]

- `provider-discover.ts:60-62` calls `browse(ctx, { page })` with no limit. The provider's default limit is 24 (`provider.ts:110`), so each preview downloads 24 titles and keeps 6 (`slice(0, limit)`; `DiscoverPage.tsx:89`).
- The rate gate lives in the renderer module (`apps/web/app/lib/provider-registry.ts:81`). A reload resets it while the remote 429 horizon persists.

## 2. Section inventory

### What the MangaDex provider exposes

`createMangaDexProvider` (`packages/extensions/src/mangadex/provider.ts:205-224`):

- `search`
- `browseLatest`
- `browsePopular`
- `getDetails`
- `getChapters`
- `getPages`

Manifest (`manifest.ts:27-39`) declares:

- `discovery.search`
- `discovery.latest`
- `discovery.popular`
- `metadata.details`
- `metadata.chapters`
- `metadata.pages`
- `metadata.languages`
- `content.nsfw`
- `content.ratingFilter`
- `content.tagFilter`
- `ops.officialApi`

### Sections vs UI vs spec

| Section                  | Provider code                                       | Manifest capability                                               | Discover UI                                            | Spec                                                                                                    |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Latest updates           | `browseLatest`, `order[latestUploadedChapter]=desc` | `discovery.latest` true                                           | `MANGADEX_SECTION_DEFINITIONS` (`discover.ts:11-24`)   | SPEC.md:385 "Browse latest, popular, tag, provider"; SPEC.md:236 capabilities include "latest, popular" |
| Popular                  | `browsePopular`, `order[followedCount]=desc`        | `discovery.popular` true                                          | same                                                   | same                                                                                                    |
| Tag or genre browse      | none (`getTags` not implemented)                    | `metadata.tags` not declared, `discovery.browse` not declared     | none                                                   | SPEC.md:229 "Tags, genres, languages, content ratings when supported"; SPEC.md:385 "tag"                |
| Recently added           | none (the API supports `order[createdAt]`)          | none                                                              | none                                                   | not in specs                                                                                            |
| Top rated                | none (the API supports `order[rating]`)             | none                                                              | none                                                   | not in specs                                                                                            |
| Seasonal, Staff picks    | none                                                | none                                                              | none                                                   | not in specs                                                                                            |
| Recommendations, related | none                                                | `metadata.recommendations`, `metadata.relatedTitles` not declared | none                                                   | SPEC.md:236, :286, :390 "where supported"                                                               |
| Random                   | none (`/manga/random` returns 200)                  | none                                                              | none                                                   | not in specs                                                                                            |
| Search                   | `search`                                            | `discovery.search` true                                           | `/search` route, not Discover                          | SPEC.md:369-380                                                                                         |
| Recently updated         | -                                                   | -                                                                 | library feature (`SPEC.md:307`), unrelated to Discover | -                                                                                                       |

### Why there are exactly 2 sections [Code]

1. `ProviderSectionDefinition.browse` is typed `'browseLatest' | 'browsePopular'` in two places (`mangadex/discover.ts:8`, `apps/web/app/lib/provider-registry.ts:42`).
2. `ProviderContract` has no generic feed method, only `browseLatest` and `browsePopular` (`extensions-sdk/src/contract-types.ts`).
3. `getEnabledSections` (`provider-discover.ts:24-29`) is `binding.sections ∩ capabilities`, so a section can only come from `MANGADEX_SECTION_DEFINITIONS`.
4. `discover.test.ts:18-23` pins the list to `[['latest','Latest updates'],['popular','Popular']]`.
5. The page copy is "Browse popular and latest manga from your enabled providers." (`DiscoverPage.tsx:196`).

No additional sections are implemented to load. The spec asks for tag browsing, but does not explicitly require Seasonal, Recently added, Top rated or Staff picks. The origin of the user’s expectation is unknown.

### What mangadex.org shows [from a web search, not verified against the API]

- Popular New Titles
- Featured
- Seasonal
- Staff Picks
- Latest Updates
- Recently Added

### API support, probed live with read-only GETs

- `GET /manga` accepts `order[createdAt]`, `order[rating]`, `order[relevance]`, `order[year]` and `order[updatedAt]`. All returned 200.
- `GET /manga/tag` and `GET /manga/random` return 200.
- One `GET /list/{id}` returned 200. Whether current Seasonal and Staff Picks correspond to stable API-accessible lists, and how to discover them, requires verification; no fixed IDs should be assumed.

### A second, runtime-only gap

Even the 2 shipped sections can render as 1 or 0 (B1, B6), or be hidden because the response was empty (`DiscoverPage.tsx:68-70`). A user can therefore see fewer than 2.

## 3. Discover state machine

### Queries and their gates (`routes/discover.tsx`)

- `D` = local DB status: `loading | ready | error` (`local-db-provider.tsx`). It becomes `ready` only after the first-party install and the allowlist sync (`local-db-provider.tsx:101-103`). A failed sync only toasts, and the status still becomes `ready`.
- `S` = `appSettingsQuery`: `pending | success | error` (`routes/discover.tsx:182-186`).
- `F` = feed query `discoverQueryKeys.providers(explicitContent)`, enabled when `D = ready ∧ S = success` (`routes/discover.tsx:190-195`).
- `X` = section infinite query, enabled when the URL has `provider+section` and a title is resolvable (`routes/discover.tsx:101-129`).

### Render rules (`DiscoverPage.tsx`)

- `isLoading = D=loading ∨ F.isLoading ∨ S.isLoading` (`routes/discover.tsx:214`).
- `isError = D=error ∨ F.isError ∨ X.isError` (`routes/discover.tsx:215`).
- `<DiscoverLoading>` renders when `isLoading ∧ ¬isExpandedView`.
- `<ErrorState>` renders when `isError`.
- Hint renders when `D=ready ∧ ¬F.loading ∧ ¬F.error ∧ providers = 0`. It ignores `X` and `S` errors.
- `<DiscoverProviderBrowser>` renders `null` when `isError`, or `providers = 0`, or no active provider.

These surfaces are independent booleans, not one state. They can stack:

- Skeleton plus ErrorState: deep-link `?provider=…&section=…` where `X` fails fast while `F` is still loading or parked. [Code]
- Hint plus ErrorState: `providers = 0` with a failing `X`. [Code]

### Transitions

```
              D=loading
                 │ ready                 │ error → ErrorState "Could not load discover feed" (Retry → retryDb)
                 ▼
          S pending ──ok──▶ F loading ──all sections empty ∧ some failed──▶ F error ── Retry(refetch) ─▶ F loading
                │ error              │ ok
                ▼                    ▼
        (stuck: F disabled;     loaded ┬─ ≥1 section with results ─▶ content   [dropped failures invisible: B1]
         hint "Browse providers")      ├─ 0 providers (disabled/uninstalled) ─▶ hint
                                       └─ all sections empty, none failed ─▶ blank page, no copy (providers.length>0, sections=[] renders empty tabpanel)
loaded ─SeeAll(p,s)─▶ URL ?provider&section ─▶ X loading ─▶ X loaded ─scroll─▶ X fetchingNext ─ok─▶ X loaded
                                                    │ error (initial or next page)         │ error
                                                    ▼                                      ▼
                                         page ErrorState (Back hidden, results hidden: B2) ─Retry(refetch ALL pages)─▶ …
loaded ─SelectProvider(p)─▶ selectedTab=p ∧ URL ?provider=p (section cleared)
loaded ─Back from section─▶ URL ?provider=p (section cleared) → previews
history Back/Forward ─▶ URL changes; selectedTab (useState) unchanged: B9
explicit-content toggle ─▶ F key changes ─▶ new query, skeleton (no stale data)
external DB handle swap ─▶ invalidateQueries() ─▶ every query refetches
```

### Where it can get stuck or throw

| Where                                             | Cause                                                                                                       | Result                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| F loading                                         | gate parked on a 429 horizon (up to 15 min) or hung requests (about 62s)                                    | skeleton, no text, no Cancel    |
| S error                                           | `appSettingsQuery` fails                                                                                    | F disabled forever, empty hint  |
| X next-page error                                 | any page-2+ failure, or the 10k window                                                                      | page-level error, Back hidden   |
| F partial                                         | one section fails                                                                                           | silent, no retry                |
| All sections empty with providers present         | `sections=[]` still renders the tab strip with an empty `tabpanel`                                          | blank panel with no copy [Code] |
| `explicitContent` true toggled during a slow load | new key restarts the load                                                                                   | long skeleton                   |
| Deep link with a bad `section`                    | `resolveExpandedSectionMeta` returns null (`routes/discover.tsx:58-81`) and falls back to previews silently | fine                            |

## 4. TLA+ model proposal (for the TLA+ agent)

### Scope

Model the route-level state machine (section 3) plus an abstract environment. Compare two configurations:

- `IMPL`: current behavior.
- `FIX`: proposed behavior.

These are proposed properties and predicted outcomes, not results: no TLA+ model or TLC run was performed in this audit.

### Constants (finite)

- `Providers = {A, B}`. `B` models a future second provider; today only `A` has a binding.
- `Sections = {latest, popular}`.
- `MaxPages = 3`.
- `MaxAutoRetries = 1`.
- `ParkBudget` and `TimeoutBudget` as abstract tick counts, for example `ParkBudget = 4`, `TimeoutBudget = 2`.
- `Kinds = {ok, http5xx, rate429, hang, blocked, tls}`.

### Variables

| Variable      | Domain                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `db`          | `loading, ready, error`                                                                                     |
| `settings`    | `pending, ok, failed`                                                                                       |
| `allowlist`   | `unsynced, synced`                                                                                          |
| `installed`   | `SUBSET Providers` (enabled and installed)                                                                  |
| `url`         | `[provider ∈ Providers ∪ {none}, section ∈ Sections ∪ {none}]`                                              |
| `tab`         | `Providers ∪ {none}` (the `selectedProviderId` state)                                                       |
| `feed`        | `disabled, loading, success, error`                                                                         |
| `sec`         | `[Providers × Sections → idle, inflight, ok, empty, failed]`                                                |
| `autoRetries` | `[Providers × Sections → 0..MaxAutoRetries]`                                                                |
| `gateBlocked` | `0..ParkBudget` (ticks remaining of a 429 park)                                                             |
| `net`         | env choice per request: one of `Kinds`                                                                      |
| `xq`          | `disabled, loading, ok, fetchingNext, errorFirst, errorNext`                                                |
| `loadedPages` | `0..MaxPages`                                                                                               |
| `hasMore`     | `BOOLEAN`                                                                                                   |
| `view`        | derived: set of surfaces drawn `⊆ {skeleton, error, hint, content, partialBanner, backButton, retryButton}` |
| `defaultSort` | `{none, latest, popular}` (to model B6)                                                                     |
| `clock`       | tick counter (bounded)                                                                                      |

### Actions

- Startup: `DbReady`, `DbFail`, `DbRetry`, `SettingsOk`, `SettingsFail`, `AllowlistSync`, `AllowlistFail`.
- Feed:
  - `StartFeed` (`db=ready ∧ settings=ok`).
  - `SectionResponse(p, s, kind)` for each `Kinds` value. A `rate429` response sets `gateBlocked = ParkBudget`.
  - `Tick`, which decrements `gateBlocked` and ages hung requests.
  - `Timeout(p, s)`.
  - `AutoRetry(p, s)`, bounded by `MaxAutoRetries`.
  - `UserRetry`.
- Navigation:
  - `SelectProvider(p)`.
  - `SeeAll(p, s)`.
  - `BackFromSection`.
  - `HistoryBack`, `HistoryForward`.
  - `ToggleExplicit`.
- Section list:
  - `LoadMore`, `LoadMoreOk`, `LoadMoreFail`.
  - `LoadMoreWindow10k` (a failure when `loadedPages` reaches the cap).
- Installs: `DisableProvider(p)`, `EnableProvider(p)`.
- `DbSwap` (external handle change, which invalidates all queries).

### Invariants (safety)

| Name                               | Statement                                                                                                                                                         | `IMPL` result                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `TypeOK`                           | Variable domains hold.                                                                                                                                            | passes                               |
| `OneSurface`                       | Exactly one of `{skeleton, error, hint, content}` is drawn.                                                                                                       | fails (stack of skeleton and error)  |
| `ErrorIsRecoverable`               | Whenever `error` is drawn, `retryButton` is drawn, and `backButton` is drawn if `url.section ≠ none`. After `UserRetry` the error clears or a new request starts. | fails (Back hidden, B2)              |
| `NoSilentPartial`                  | If any `sec[p,s] = failed` for the active provider, `partialBanner` (or an inline failed row) is drawn.                                                           | fails (B1)                           |
| `LoadedResultsPreserved`           | `loadedPages > 0` implies `content` is drawn, even when `xq = errorNext`.                                                                                         | fails (B2)                           |
| `ProviderSwitchResets`             | After `SelectProvider(p)`: `url.provider = tab = p`, `url.section = none`, and no `xq ≠ disabled` for a provider other than `p`.                                  | fails after `HistoryBack` (B9)       |
| `UrlTabAgree`                      | `url.provider ≠ none ⇒ tab = url.provider`.                                                                                                                       | fails (B9)                           |
| `SectionsMatchManifest`            | Every drawn section is in `Declared(p) ∩ Capable(p)`. Every `Declared ∩ Capable` section is drawn, or flagged failed, or flagged empty.                           | fails when a section is dropped (B1) |
| `DefaultSortKeepsSectionsDistinct` | With `defaultSort ≠ none`, `latest` and `popular` use different orders.                                                                                           | fails (B6)                           |
| `DisabledProviderNoNewRequests`    | After disabling `p`, no new request is sent; model already in-flight IPC separately.                                                                              | passes (expected)                    |
| `AuthoritativeErrorKind`           | The drawn error identifies db versus provider versus rate-limit versus offline. It is not one static copy.                                                        | fails (B7)                           |
| `SettingsFailNotEmpty`             | `settings = failed ⇒ hint` is not drawn, and `error` plus Retry is drawn.                                                                                         | fails (B8)                           |
| `RetryBounded`                     | `autoRetries ≤ MaxAutoRetries`.                                                                                                                                   | passes                               |

### Liveness

- `NoStuckLoading`: `skeleton` is drawn at most `TimeoutBudget·(MaxAutoRetries+1) + ParkBudget` ticks, after which `error` or `content` is drawn. This is a bounded-wait temporal property. In `IMPL`, model a finite 15-minute park exceeding a chosen interactive budget; TLC requires finite domains. In `FIX`, show an actionable waiting state. State fairness assumptions and whether repeated 429s extend the horizon.
- `EventuallySettles`: under fairness on `Tick`, `Timeout`, `SectionResponse` and `UserRetry`, `skeleton` leads to `¬skeleton`.

### Finite configurations

- Small:
  - 1 provider, 2 sections, `MaxPages = 2`.
  - `Kinds = {ok, http5xx, rate429}`.
  - Run first; the state count is unknown until the model is implemented.
- Full:
  - 2 providers (adds B9), `MaxPages = 3`, all `Kinds`.
  - `defaultSort ∈ {none, latest, popular}`.
  - Use symmetry on `Providers`.
- Mutation checks, so the invariants prove they can fail:
  - Turn off the partial banner, and `NoSilentPartial` must fail.
  - Hide Back, and `ErrorIsRecoverable` must fail.
  - Remove the tab-sync action, and `UrlTabAgree` must fail.

## 5. Root causes and proposed fixes (ranked, not implemented)

### P1 - Surface per-section outcomes and retries (B1, B3)

- Make each section its own query, keyed by `(provider, section)`, instead of one `Promise.allSettled` in a single query function. This gives independent loading, retry and an error kind per section.
- If keeping the single query, return `{ id, title, status: 'ok'|'empty'|'failed', error }` for each section, render a failed row with an inline Retry, and re-fetch only that section.
- Give a section with `status: 'empty'` a visible empty row instead of `return null`.
- Rework `fetchProviderDiscoverData` to stop dropping `failures`.

**Tests**

- Flip `provider-discover.test.ts:149-160` to also assert the failed section is reported.
- Component test: a failed section shows its title, copy and Retry.
- E2E (`apps/web/e2e-production`):
  - Given popular returns 500 and latest returns 200: "Popular" shows a failed row, Retry re-requests only popular and recovers, and latest is not refetched.
  - Mirror the existing search failure test in `search-discovery.spec.ts` (second test).

### P2 - Do not let a next-page failure replace the page (B2, B10)

- Page-level error only when `X` has no data. When pages exist, show an inline footer "Couldn't load more. Retry" that calls `fetchNextPage()` only.
- Always render Back, and pass `onBack` to `ErrorState` for the page-level case.
- Cap paging using the next request window: with fixed page size require `offset + 2 * limit <= 10000` as well as remaining results, or use an offset-based contract to request a smaller last page. Test the returned page size and boundary.
- Retry should not re-request every loaded page in a burst. Use `fetchNextPage` for next-page failures; validate selective refetch against the installed TanStack Query version.

**Tests**

- E2E: page 1 ok, page 2 fails: the grid stays, the footer retry works, and the request count is 1 for the retry.
- Provider unit test: `hasMore = false` at the 10,000 boundary.

### P3 - Bound and explain waiting (B3)

- Expose `gate.remainingWaitMs()` for interactive calls and fail fast: an interactive call (Discover) can pass `maxWaitMs` to `gate.acquire`.
- Return a typed `rate-limited` error carrying `retryAfterMs`, and show "MangaDex is limiting requests. Try again in Ns." with Retry.
- Do not auto-retry on `rate-limited` (set `retry` to false for that kind). Today `retry: 1` queues a second request behind the park.
- For discovery, use a shorter timeout than 30s (around 15s), and cap the total skeleton time.

**Tests**

- Gate unit test for `maxWaitMs`.
- E2E: 429 with `Retry-After: 25`: within 3s the page shows the rate-limited copy with a countdown. This reproduces the old failure (skeleton for 56s+).
- E2E hang (held request): an error with Retry appears within the bounded budget.

### P4 - Windows transport (B4, H1-H4 in section 6). Verify first, then fix

1. **Diagnostics first.**
   - Keep the Node `err.code` and any TLS error on `NetworkFetchError` (`main-process-fetch.ts:373`).
   - Map to distinct typed errors (`network.tls`, `network.connect-refused`, `network.dns`, `network.timeout`, `network.blocked-url`) over IPC.
   - Preserve the code in `createProviderFetch` (`provider-fetch.ts:75-77`) instead of `new Error(message)`.
   - Make the SDK `normalizeProviderError` keep `platform.*` and `network.*` codes (`extensions-sdk/src/errors.ts`) rather than collapsing to `extensions.sdk.unknown`.
   - Store the code in the provider activity log (`extension-logs.ts:103-111` stores `code` and `message` only).
2. **Then, based on what the code shows on a failing Windows machine:**
   - If it is TLS or CA: the Node hop may have different trust behavior from Chromium; verify the packaged Electron runtime and its flags. Options may include Node's system-CA option (`--use-system-ca` or `NODE_USE_SYSTEM_CA`, to be verified for Electron 44's bundled Node), or moving to Chromium's network stack.
   - If it is a proxy: the hop has no explicit system proxy integration. Depending on verified runtime behavior it may need an Electron `session.resolveProxy`-driven agent or `net.request`.
   - Moving to `net.request` or `session.fetch` while keeping the pinned-address SSRF guard needs a separate design, because the guard works by pinning the connection to a pre-resolved address.
3. Try every resolved address, not only `addresses[0]` (`main-process-fetch.ts:210`). Lower priority: the API and upload hosts returned no AAAA records in one audit-time DNS probe, but DNS answers can vary. The `*.mangadex.network` at-home hosts were not checked.

**Tests**

- Unit: a self-signed TLS server must produce an error whose code identifies TLS. I demonstrated that today it produces only `Network request failed.` with no cause.
- Contract: the `platform.io-failed` and `network.*` codes survive into `recordProviderFailure`.
- Windows CI smoke on `windows-2025`: launch the packaged app and call the provider bridge against a local HTTPS fixture with a custom CA. Today the E2E fixture bypasses the real hop.

### P5 - Do not let `defaultSort` collapse sections (B6)

- Browse sections should keep their own order. Apply `defaultSort` to search or to a "default sort" browse section.
- Update `provider-settings.test.ts:91-98`, which asserts the opposite.
- If the product wants it to affect browse, the Settings copy and the Discover section titles must say so.

### P6 - Make sections declarative and add the missing ones (B5)

- Replace the two-value `browse` union with a generic provider method such as `browseSection(ctx, { sectionId, page })`.
- Declare the sections in the manifest, in the same data-first spirit as P3 in `docs/overhaul/05-providers.md`. A section list in the manifest also makes `SectionsMatchManifest` checkable.
- Candidate MangaDex sections, each backed by `GET /manga`:
  - Recently added (`order[createdAt]`).
  - Top rated (`order[rating]`).
  - Popular new titles (`createdAt` window plus `order[followedCount]`).
  - Genres through `getTags` plus `includedTags[]`, which also uses the already-declared `content.tagFilter` and the unused `discovery.browse` capability.
  - Random (`/manga/random`).
- Seasonal and Staff Picks require a product decision and verification of a supported data source; do not assume stable pinned list IDs.

**Tests**

- Extend `discover.test.ts` so every declared section's capability is true and its method exists. It already does this for the 2 today.
- UI test for `SectionsMatchManifest`.
- Fixtures for each new endpoint.
- Extend the opt-in `MANGADEX_LIVE=1` smoke (`live-smoke.test.ts`).

### P7 - Use real error classification (B7)

- Use `failureMessage`/`classifyAppError` for Discover copy.
- Separate "your library could not be opened" (db error) from "MangaDex failed".
- Name the provider (`ErrorState` has a `providerName` prop).

### P8 - Handle app-settings failure (B8)

- Include `appSettingsQuery.isError` in `isError`, with Retry.
- Or fall back to `explicitContent = false` instead of disabling the feed.

### P9 - One source of truth for the tab (B9)

- Derive the active provider from the URL search param instead of `useState`. The repo's own D10 rule also bans new `useState`.
- Key `useExpandedSection` on the active provider, and tear down the section query on a provider switch.

### P10 - Smaller items (B11)

- Pass the preview `limit` (6) to the browse call.
- Propagate abort into main. Add a cancel to the provider-network IPC, or accept it as documented.
- Consider persisting the gate horizon so a reload does not reset it.

## 6. Windows hypotheses and confidence

### Hypotheses for "Discover fails a few times"

| ID  | Hypothesis                                                                                                                                                                                 | Why plausible                                                                                                                                                                 | Confidence          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| H1  | **TLS interception or custom root CA** (antivirus HTTPS scanning, corporate proxy). The main-process hop uses Node `https`, whose configured certificate trust may differ from Chromium’s. | I reproduced the shape locally with a self-signed server: `network.transport-error`, cause lost. The Windows trust configuration and the user’s network have not been tested. | Unranked hypothesis |
| H2  | **System proxy or VPN-only egress.** the hop has no explicit Windows proxy integration (`HTTPS_PROXY` was ignored in one macOS test).                                                      | Direct connect to the API is blocked, so requests hang for the 30s hop timeout, then retry. Matches "fails a few times".                                                      | Unranked hypothesis |
| H3  | **MangaDex rate limiting or an anti-bot block on the user's IP.** The client sends `user-agent: MangaVerse/0.0.1` and two concurrent section requests.                                     | Produces 429 or 403. A 429 parks the gate with no UI (B3). A 403 or HTML block page maps to `payload_invalid`.                                                                | Low-Medium          |
| H4  | **The data host or the first-party install did not come up**, so Discover reads an empty or failed DB.                                                                                     | The handoff says Windows install and `node:sqlite` are unproven (`docs/overhaul/handoff.md:30`). Cross-check with the electron-runtime audit (04).                            | Low                 |

Also checked and judged **unlikely** for Windows:

- **Allowlist startup race.** `local-db-provider.tsx:101-103` syncs the allowlist before the DB reports `ready`. A failure only toasts, but then every request gets `Provider may not reach this host.`
- **`app://` path separators.** `app-protocol.ts:36-110` uses `node:path` consistently and rejects `\`. A failure there would break the whole app, not just Discover.
- **IPv6 for the API host.** DNS probes at audit time returned A records and no AAAA records; answers can differ by network and time.

### What I could not verify

- Nothing ran on Windows. No packaged Windows build, no Electron run on this macOS box, and no real 429 or block from MangaDex.
- I never saw the user's actual error text. The report says "throws errors a few times" without the message.
- Whether "2 sections" refers to Discover or something else (for example the Extensions detail page capability list showing "Latest updates" and "Popular titles"). Both show 2.
- Actual response headers on a MangaDex 429 were not captured.
- `--use-system-ca` or `NODE_USE_SYSTEM_CA` under Electron 44's bundled Node needs checking before relying on it.
- The mangadex.org home-page sections come from a web search, not from the API.
- The dev server resolves workspace packages from `packages/*/dist`. I confirmed the Discover section definitions match between `src` and `dist`, but I did not rebuild.

### What to ask the user for

1. The Diagnostics page's provider log. Today it will say only "An unexpected error occurred.", which is itself B4.
2. On the failing Windows machine (PowerShell):
   - `curl.exe -v https://api.mangadex.org/ping`
   - `netsh winhttp show proxy`
   - `nslookup -type=AAAA api.mangadex.org`
   - Run `certutil -verifystore Root` if an AV or proxy is suspected.
3. Whether the same machine's browser loads `https://api.mangadex.org/ping`. A yes with an app failure points at H1 or H2.
4. The exact text on the Discover error screen.

## 7. Reproduction notes and cleanup

- Scripts and screenshots are under `/tmp/audit03/` (outside the repo, ephemeral):
  - `lib.mjs`, `s1-baseline.mjs`, `s2.mjs`
  - `shots/*.png`
  - `out-rate429.txt`, `out-hold.txt`
- Temporary vitest files in `apps/web` and `apps/desktop` were deleted after use.
- The dev server on port 5199 was stopped and port 5199 is free. No browsers or Electron processes of mine remain.
- I changed no source. The only file I wrote in the repo is this one.
- `git status` in this shared worktree shows other auditors' uncommitted files. Those are not mine.

### Targeted checks on continuation

- In `apps/web`: `pnpm exec vitest run app/queries/__tests__/provider-discover.test.ts app/__tests__/routes/discover-route-providers.test.tsx app/features/search/components/DiscoverPage.test.tsx` — **3 files, 10 tests passed**.
- In `packages/extensions`: `pnpm exec vitest run src/mangadex/discover.test.ts src/mangadex/provider-settings.test.ts src/mangadex/provider-contract.test.ts` — **3 files, 15 tests passed**.
- These are existing tests, not new red/green regression tests; passing does not disprove the observed bugs. No source changes or full suite were run in the continuation.
