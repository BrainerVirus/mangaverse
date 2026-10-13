# Web-first recovery implementation plan

> For the implementing model: use `executing-plans` for one slice at a time and
> `workit-bdd` for behavior changes. Do not execute this whole plan as one change.

**Goal:** Deliver a publishable local-first web reading journey before Electron work.

**Architecture:** Keep the monorepo and deepen the existing storage and provider
interfaces. Routes compose normalized local data and cancellable provider queries;
the reader handles local interaction and progress checkpoints.

**Tech stack:** TypeScript, React, TanStack Start/Router/Query, Drizzle SQLite/WASM,
browser durable storage, existing shadcn wrappers, Vitest and Playwright.

## Handoff / first read

Read [spec.md](spec.md), `docs/SPEC.md`, `docs/ARCHITECTURE.md`, and `docs/Design.md`
when changing UI. This recovery sequence supersedes historical polish-first phase
ordering. The June MangaDex spec is reference material, not an executable acceptance
record: its contradictory approval label and assumptions must be corrected.

Checkout: `fix/desktop-db-shadcn-mangadex`; startup repair `f15be8c` is local-only.
The previous spec commit `48942e2` is also ahead of the inspected remote. Preserve
untracked root `index.js`; do not stash/delete/commit it without understanding ownership.
Workit's self verdict was blocked by this dirty worktree, not by failing final tests.

At takeover run `git status --short --branch`, `workit handoff`,
`workit ledger list --last 200`, then `workit check test` and
`pnpm test:e2e:production`. Reconcile current remote tips before any mutation.
Never assume inherited green results are fresh. No app graph was indexed during
planning; use the graph if now available, otherwise inspect these bounded paths.

Current configured check names: `test`, `lint`, `typecheck`; no configured `build`.
`pnpm --filter @app/web build` and `pnpm test:e2e:production` are real commands,
but ad-hoc Workit checks do not satisfy the configured test gate.

## S0: Production startup (completed locally)

Touches: `apps/web/server.ts` (removed), `apps/web/vite.config.ts`, package manifests,
`apps/web/tsconfig.json`, `apps/web/playwright.production.config.ts`,
`apps/web/e2e-production/startup.spec.ts`, `.github/workflows/ci.yml`.

- [x] Reproduced production failure despite successful compilation.
- [x] Removed duplicate Nitro server entry and externalized/declared `tslib`.
- [x] Built-app Chromium opens onboarding and advances to “Choose your look”.
- [x] Added the smoke check to CI and stabilized seasonal test Date input.
- [x] Observe remote CI after eventual push; local pass is not remote delivery.
      Observed: CI green on head `0b60525` (run 38280501768), before the storage
      commits. A later green run is required for the final head.

Verification measured: configured checks passed (with cache reuse), production E2E
passed, targeted audit had no findings. Existing lint warnings and import-load
timeout are backlog, not newly repaired. This proves startup, not reading/storage.

## S1: Durable browser storage (R1 reload, R2)

Suggested branch: `fix/web-durable-storage`, based on the accepted S0 tip.

Read/modify: `apps/web/app/lib/local-db.ts`,
`apps/web/app/providers/local-db-provider.tsx`, `packages/db/src/client.ts`,
`packages/db/src/adapter.ts`, `packages/db/src/transactions.ts`, repository mutation
callers, and `packages/platform/src/blob-storage-idb.ts`/platform exports as needed.
Do not store database bytes under the cover/page-cache namespace that storage
cleanup can erase. Add focused database persistence tests and
`apps/web/e2e-production/persistence.spec.ts`.

- [x] Probe SQL.js export/import with real repositories and IndexedDB in Chromium.
      Probe confirmed: `export()` returns `Uint8Array`, the constructor reloads it,
      and sql.js ships an `updateHook` on `Database`. Core landed as
      `packages/db/src/persistent-database.ts` + `persisted-bytes-store.ts` with 4
      behavior tests (reopen, unflushed-loss, corrupt-quarantine, conflict-reload);
      wired through `@app/db/browser`. IndexedDB adapter and app wiring still open.
- [x] Design transparent multi-tab convergence with a safe merge/replay strategy
      before wiring byte storage (D5: no lockout). Implemented: compare-and-swap
      snapshot store plus a `localStorage` version ping that makes other tabs
      re-sync and invalidate their queries after a committed write. A later-opened
      tab observes earlier commits without a manual reload. Two-tab overflow
      behavior still needs its red test (next item).
- [x] Add the IndexedDB-backed `PersistedBytesStore` (own namespace, not the
      cover/page cache store) and wire the browser app to open through
      `openPersistentDatabase`. `apps/web/app/lib/persisted-bytes-idb.ts` uses its
      own `mangaverse-local-db` database; `apps/web/app/lib/local-db.ts` owns the
      session plus `flushLocalDb` (durability point) and `scheduleLocalDbFlush`
      (400 ms coalescing); `LocalDbPersistenceBridge` flushes on `pagehide` and on
      unmount. `flush` returning `reloaded` re-syncs handles instead of being
      ignored.
- [x] Write a red browser scenario saving onboarding, then reload/reopen the
      context. `apps/web/e2e-production/persistence.spec.ts` now proves finished
      onboarding survives a production reload. Library item/provider state/page-2
      coverage still belongs to S3/S4 where those flows become real; the acceptance
      for this slice is the reload that previously reset the app.
- [x] Write a red two-tab scenario where tab A commits a library change and tab B,
      opened before it, later commits a different change; both changes must survive.
      `apps/web/e2e-production/multi-tab.spec.ts` proves convergence without reload
      and dual-write survival. Independent verification (finding 479cd7a3) showed
      the spec passes with the pre-fix retirement/ordering/visibility code restored;
      only removing query invalidation makes it fail. The retirement bound is now
      pinned separately by a unit test (see below); the spec is behavior coverage,
      not proof of the specific fix mechanism.
- [x] Navigation-time flush: the onboarding finish/skip/install-provider navigations
      await `flushLocalDb()` before sending the user on, pinned by a discriminating
      E2E (quiescent session → finish → navigation implies a new committed ping;
      confirmed failing when the flush await is planted away). Remaining window is
      dirty-exit only (crash or hard close inside ~400 ms), where the unload flush
      stays best-effort. `<shortcut: 400 ms coalesced flush for non-navigating
      mutations, upgrade if dirty-exit loss is ever observed>`.
- [x] Connection invariants after export (found while pinning navigation-time
      durability): `sql.js` `Database.export()` detaches the `updateHook` and resets
      `PRAGMA foreign_keys`, so after the first flush later writes scheduled no
      debounced flush and ran without FK enforcement, and every stored-bytes open
      started with FKs off. `openPersistentDatabase` now re-establishes both after
      every export and on every open (including the sync swap), pinned by four tests
      that fail when the re-establishment is removed (the sync-swap one was added
      after the #31 verifier flagged the line as untested).
- [x] Flush completeness (verifier finding 7276faee): `flushLocalDb` no longer
      settles on an in-flight flush that predates the latest write. The coordination
      moved to `apps/web/app/lib/local-db-flush.ts` with injected `flushOnce`/
      `currentSeq`; a test proves a request arriving during a parked flush triggers a
      second flush, and fails against the old early-return (planted).
- [ ] CAS conflict policy: a losing tab's uncommitted local writes are replaced by
      the store snapshot (`persistent-database.test.ts` conflict case). Accepted for
      now: committed snapshots never lose data, and the losing tab converges. Revisit
      if interleaved edits become common.
- [x] Retirement bound pinned: `persistent-database.test.ts` proves a retired handle
      survives exactly one sync generation and the next sync closes it, and a second
      test seeds a committed snapshot at the loaded version and asserts the working
      handle is not retired (that test fails when the version no-op check is removed;
      the earlier empty-store version was vacuous — verifier finding 8a9b50de).
      `syncFromStore` is a no-op when the store version is unchanged, so redundant
      pings cannot burn the buffer. Residual limit: a consumer outliving two syncs
      can still be closed under it.
- [x] Session lifecycle hardening (verifier finding f78dcbbc plus #28 follow-ups):
      `resetLocalDb` bumps a generation; flush and sync bail out when a reset landed
      during the session-promise await, and the session refuses syncs after close
      (closed flag checked before and after the store read), so a sync parked in
      `read` cannot revive an orphan session — pinned by a gated-store test that
      fails when the guard is removed. A failed open only clears the shared promise
      slot when it is still the current attempt; cross-tab sync failures are caught
      and logged instead of becoming unhandled rejections.
- [x] Persistence failures are surfaced (R2): `flushLocalDb` reports the failure to
      a UI handler and clears it on the next successful flush; the shell renders a
      destructive banner with Retry (`apps/web/app/components/PersistenceErrorBanner.tsx`)
      so the app never implies a save is durable when it is not. The whole wiring is
      pinned by three tests that go red when planted away: error report and
      success-clear through the real `local-db` module (mocked session/store), and
      provider registration/unregistration driving the real banner through the real
      context (verifier finding caf7eefe). A forced browser-quota test is still not
      practical; denial paths share the error path with any flush failure.
- [x] Attach the flush to mutations, not unload: `openPersistentDatabase` gained an
      `onMutation` update hook (re-attached after each sync swap) wired to the 400 ms
      coalesced flush; `pagehide` remains a fallback. Review finding confirmed the
      earlier design was unload-only.
- [ ] Reader-mode persistence failures are silent (`ReaderLayout` renders no banner).
      Deferred, not done: the reader keeps progress in its own debounce and will get
      explicit checkpoint/error handling in S4; decide there whether it reuses this
      banner.
- [x] Run targeted tests, configured test/lint/typecheck and production E2E; inspect
      storage after browser restart, not only component remount. All S1 items above
      landed across PRs #26–#33 with per-slice verification.

Reject: unload-only saving, periodic exports without acknowledged durability,
silent empty-DB fallback, last-write-wins whole-snapshot replacement between tabs,
and a lockout screen. If the driver changes, explicitly migrate repository/transaction
interfaces and tests in this slice rather than hiding asynchronous behavior behind casts.

## S2: Real provider contract (R3 request behavior)

Suggested branch: `feat/mangadex-provider`; depends on S0, can be authored independently
of S1 but does not establish persistence or app availability on its own.

Create a bounded provider package, suggested `packages/extensions-mangadex/`, with
manifest, factory, response validation, mapping and recorded fixtures. Register it
in the workspace using neighboring package configuration. Read
`packages/extensions-sdk/src/contract-types.ts`, request client, error helpers,
rate limiter and contract harness before defining signatures.

- [x] Write contract/fixture tests for search, details, full chapter pagination and
      ordered pages; literal expected IDs/titles/URLs must differ from mapper logic.
      Recorded fixtures live in `packages/extensions-mangadex/src/fixtures/`; mapping
      tests assert literal cover URLs and page URLs from them.
- [x] Implement SDK methods `search(ctx,input)`, `getDetails(ctx,mangaId)`,
      `getChapters(ctx,mangaId)`, `getPages(ctx,mangaId,chapterId)`, latest/popular
      only if needed by existing discovery. Keep advertised capabilities honest.
      The manifest declares exactly the six implemented methods plus `ops.officialApi`.
- [x] Validate every consumed network field, including URLs and page filenames;
      reject malformed payloads with normalized errors. Propagate `ctx.signal`.
      Hand-rolled narrow validators instead of the June spec's Zod: the repo has no
      Zod dependency and the dependency policy prefers none for four endpoints.
      Drift throws `extensions.mangadex.payload_invalid` with the endpoint.
- [x] Test data-saver fallback: when saver filenames are unavailable, use the
      original-data URL path as well as original filenames, not a mixed path.
- [x] Test empty chapter lists, service failure and multi-page chapter feeds
      (100+2 synthetic pages, two requests observed). Cancellation/rate-limit
      specifics rely on the SDK request client's tested abort path.
- [x] Add an opt-in live smoke command and fixture recording instructions. Live smoke
      ran locally against the real API (search → details → chapters → pages, 3.3 s);
      gated by `MANGADEX_LIVE=1`; README documents fixture refresh.
- [x] Run package tests/audit and configured gates. Commit S2 without route changes.
      19 package tests pass; live smoke skipped by default; no route or app imports.

Do not implement personalized “recommendations” by relabeling arbitrary browse
results. The current SDK supplies source IDs; app identity mapping remains distinct.

## S3: Production provider and app journey (R3 app availability)

Suggested branch: `feat/web-mangadex-runtime`; depends on S1 and S2.

Read/modify: `packages/extensions-core/src/index.ts` and provider operations;
`apps/web/app/providers/local-db-provider.tsx`;
`apps/web/app/queries/search-query-options.ts` and new provider query options;
`apps/web/app/routes/search.tsx`, `discover.tsx`, `manga.$id.tsx`,
`reader.$chapterId.tsx`, `extensions.tsx` and onboarding wiring.
Read the five `apps/web/app/lib/dev-mangadex-*`/`dev-seed-mangadex.ts` files and
`apps/web/vite.config.ts` before replacing their callers.

- [x] Write red production E2Es for fresh provider availability, search/detail,
      restart preservation and provider disable blocking all remote operations.
      `apps/web/e2e-production/mangadex-flow.spec.ts` (5 tests, fixture-mocked API +
      at-home CDN) covers install/enabled, provider search with rendered covers,
      detail with feed chapters, reader with 37 decoded pages, and disable blocking
      all remote calls (request counter stays 0). Detail and reader tests navigate
      by id directly: clicking an animated grid card never passes Playwright's
      stability check on slow CI runners, so the card click is covered by the
      search test instead.
- [x] Implement one explicit built-in registration path and provider resolution
      through installed/enabled state. Community manifests still require consent.
      `installFirstPartyProviders` upserts the bundled manifest without network and
      never re-enables a disabled provider; `resolveInstalledProvider` returns null
      for disabled/unknown ids so no remote call can happen through them.
- [x] Wire Query keys to source ID, query, language/content settings and page input;
      propagate invocation cancellation and prevent stale writes. Query fns receive
      `signal` and forward it through the provider context; the app-level
      `dev-md-`/`dev-md-ch-` id conventions are preserved by `mangadex-ids.ts` so
      existing library/progress rows keep working.
- [x] Probe actual API/image CORS from a production browser, not Electron/Node fetch.
      Probed: MangaDex reflects the requesting origin (`acao=http://localhost:5184`),
      so direct calls work and no rewrite/proxy is needed for v1.
- [x] Found and fixed a product bug while migrating search: `CoverCacheProvider`
      returned bare `children` before the database was ready and a context wrapper
      after, and the tree-shape flip made React remount the entire app subtree —
      wiping in-progress input and aborting provider queries mid-flight. It now
      always renders the same shape and exposes readiness through the context value;
      pinned by a cache-package regression test that fails on the old shape.
- [x] Chapter feed normalization: unreadable `pages: 0` entries are dropped and
      duplicate chapter indices collapse, because the app stores one chapter per
      (provider mapping, index) — a real recorded feed contained both and aborted
      detail persistence with a UNIQUE constraint error. Pinned by provider tests.
- [x] S3b: `discover.tsx` runs through the provider (`mangadex-discover.ts`,
      capability-driven sections: Latest and Popular only, per-section failure
      isolation), covered by a new production E2E asserting both sections render
      with decoded covers. The entire dev scaffold is deleted: `dev-mangadex-*`
      files and tests, the `/__dev` Vite middleware, `scripts/mangadex-dev/*`,
      `scripts/dev-install-mangadex.mjs`, the obsolete dev E2E suite and its
      Playwright config. Review-finding fixes land with it: the disable E2E now
      waits for the query to settle ('0 results' visible) before asserting zero
      remote calls — the settle point is the post-query empty state, confirmed
      failing when the resolver ignores `enabled` (an earlier '0 results' settle
      was a loading transient and passed the plant; the #36 verifier caught it);
      and
      `installFirstPartyProviders` refresh-path plus unknown/disabled-id resolver
      tests are added, both plant-verified red. Open product question recorded:
      a bundled provider re-installs after 'Uninstall' on next load (disable is
      the intended off-switch) — decide whether the UI should offer uninstall for
      bundled providers at all.
- [x] Disable durability (found by the #36 re-verification): the extensions
      enable/disable toggle awaited nothing before the UI reported the new state,
      so a navigation within the ~400 ms coalesced window silently lost the
      disable and remote provider calls resumed on reload. The toggle now awaits
      `flushLocalDb()` before settling, the same pattern as the onboarding
      navigations; the disable E2E is deterministic again and fails when the
      resolver ignores `enabled` (plant-verified). Open: other user-visible
      toggles (library add/remove/favorite, settings saves) still rely on the
      debounce — apply flush-on-success there if dirty-exit loss is ever observed.
- [x] Preserve useful fixtures while moving
      their ownership; the June spec's blanket fixture deletion is not required.
- [ ] Verify install/disable/search/detail/chapter selection against the built app,
      including normalized failure and retry. Run gates, audit and commit.

The old June spec's “raw calls bypass Query” statement is too broad: some current
calls execute inside route queries. The real missing work is SDK ownership,
validation, cancellation and production registration; inspect rather than copy it.

## S4: Reliable reading and resume (R4)

Suggested branch: `fix/web-reader-journey`; depends on S3.

Read/modify: `packages/reader/src/components/ReaderScreen.tsx`,
`fetch-reader-page.ts`, `persist-reader-progress.ts`, navigation/progress/tap-zone
helpers; `packages/cache/src/components/CachedPageImage.tsx`, `page-cache-store.ts`,
`prefetch-manga.ts`; `apps/web/app/routes/reader.$chapterId.tsx` and manga detail.
Add `apps/web/e2e-production/reading.spec.ts` and focused reader integration tests.

- [x] Strict fixtures and decoded-image assertions: `reader-flow.spec.ts` and the
      S3a flow assert `naturalWidth > 0`, page indicators and keyboard direction
      against fixture-mocked API/at-home hosts. Open nit: the shared mock still has
      a catch-all for `/manga?` browse URLs (needed by discover) — tighten to an
      explicit reject list when the offline work lands.
- [x] Reader position survives session/viewport recreation: `ReaderScreen`'s
      recreation effect used to rebuild state from `data.initialPageIndex`, so any
      ResizeObserver tick reset the reader to the start. It now keeps the current
      page for the same chapter and only uses `initialPageIndex` for first creation
      or a chapter change; live-verified (`chapterChanged=false current=1` keeps
      the page).
- [x] Navigating away before the 750 ms debounce no longer drops the page: the
      pending progress event is checkpointed on unmount instead of being discarded
      with the cleared timer.
- [x] Live reading journey (real production browser against real MangaDex):
      onboarding → real search → detail → chapter 1 → reader (`1 / 37`) → keyboard
      and trusted-click navigation to page 3 (`persist called/ok`) → reload resumes
      at `3 / 37`.
- [x] Rider from #37's verification: the install-confirmation mutation now awaits
      `flushLocalDb()` like the toggle/remove mutations.
- [x] Reader resume/checkpoint E2E un-parked and green (production suite 17/17,
      zero skips). Four root causes, each fixed and pinned:
      (a) the harness helper `waitForPingQuiet` armed its quiet window from the
      last observed ping change, so a second call returned immediately and the
      reload raced the 750 ms progress debounce — it now arms a full window per
      call; (b) a router "blip" instance (mount+unmount around the transition —
      also reachable when a user presses Back right after opening) persisted its
      initial page over newer progress — the unmount checkpoint skips a
      short-lived instance whose pending event equals its initial page;
      (c) the reader query served a stale cached page on remount — `staleTime 0`,
      `gcTime 0`, `refetchOnMount: 'always'`; (d) progress writes are ordered:
      an older event can never roll stored progress back (unit test fails when
      the guard is removed). The resume-after-reload ErrorState was the
      react-query "data is undefined" throw on a stale/racy read path, resolved
      by (a)+(c).
- [ ] Progress-ordering follow-ups from the #41 review rounds (tracked, not yet
      fixed): the ordering guard is chapter-local, so an older event for another
      chapter can still replace newer library resume metadata; the snapshot CAS
      protects committed bytes but does not merge by event timestamp, so an older
      tab flushing first can drop newer uncommitted progress; equal-timestamp
      events deliberately keep the furthest page, which is conservative against
      stale checkpoints but not strict last-action-wins for backward navigation
      in the same millisecond.
- [x] First-open failure offers an explicit retry: the reader's ErrorState is
      wired to a reader-query refetch and pinned by an E2E that fails the at-home
      route, observes 'Could not load chapter', restores the network, retries and
      asserts decoded pages. Tap-zone result assertions are also covered by the
      reader-controls trusted-click tests.
- [x] Cached offline reopening: leaving and returning to a cached chapter with
      the browser offline and every provider host aborted renders the cached
      pages (E2E). The paused-query offline UI ("You are offline" + Retry) is
      wired and component-pinned; its E2E needs a second, uncached chapter fixture
      (the recorded feed's only readable chapter is cached by the time the state
      can be observed) — recorded as a follow-up.
- [ ] Follow-ups from the #44 review: DB-init errors cannot be recovered by the
      reader's query invalidation (the query is disabled while the DB is in
      error); wire the DB retry handler for that case.
- [ ] Still open from this slice: save-failure surfacing in reader mode, prefetch
      bounds and partial-cache reporting, chrome click isolation e2e, and a
      deliberate wrong-navigation plant on the (passing) navigation test.
- [ ] Run deterministic production E2Es, gates and test audit; commit.

Audit leads, not confirmed runtime diagnoses: ReaderScreen reinitializes on changed
viewport/session input, cancels debounce on cleanup, and observes pointer events
above chrome. Reproduce each before fixing; pure helper tests alone do not prove UI.

## S5: Focused test/doc cleanup (R5, R6 docs)

Suggested branches: three small instruction-file commits in one cleanup PR,
followed by a separate behavior-test cleanup slice. Independent of S2; do not let
this expand into rewriting the whole repository before S1–S4.

Touches: `AGENTS.md`, `docs/PLAN.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`,
the June MangaDex spec, and only tests with triaged audit findings.

- [x] Phase history removed from `AGENTS.md`: the phase table and per-phase
      "tests passing" counts are gone (Git retains them; this plan is the single
      ledger). AGENTS.md went from 13,429 B (over budget — `workit knowledge lint`
      finding) to 8,191 B; lint re-run shows 0 findings.
- [x] Recovery pointers added to AGENTS.md Required Reading plus a compact
      "Recovery State (current)" section that names exactly what it replaces.
- [ ] Move judgment rules behind topic pointers only when useful; encode mechanical
      package-import/provider-location rules as executable checks, not repeated prose.
- [ ] Run `workit knowledge lint` before/after each instruction commit; no new finding.
      Canonical commands for production build/start/E2E already exist in
      `apps/web/package.json` and the root scripts; keep them current.
- [x] Test audit triaged (`workit test-audit apps packages --min-severity medium`):
      seven constants-only `PACKAGE_NAME`/token tests stay per policy (no
      replacement fits yet — they are the SDK surface contract);
      `CommandPalette.test.tsx`'s over-mocking (3 internal modules) is mitigated by
      the real command-palette E2E added above, so it stays as the fast unit net;
      the assertion-free `should export all public types` test in
      `packages/reader/src/index.test.ts` was deleted: it asserted nothing and —
      as the #43 review established with a plant — package tsconfigs exclude test
      files, so its type imports were never typechecked either. The neighbouring
      runtime-export test still asserts the surface.
- [ ] Repo-wide typecheck gap surfaced by the #43 review: every package tsconfig
      excludes `src/**/*.test.ts`, so package test code is never typechecked (only
      the web app includes its tests). Cost unknown until tried; candidate slice:
      stop excluding tests from package typecheck, fix whatever it surfaces, and
      keep it as a check. Note for future runs: `workit check test` does not cover
      lint — CI runs lint+typecheck+test+build, so run `npx oxlint apps packages`
      before pushing.
      Remove only assertion-free or truly duplicate tests after checking coverage;
      replace bad oracles and prove replacements fail on planted bugs.
- [x] Real command palette interaction coverage added:
      `apps/web/e2e-production/shell-interactions.spec.ts` drives Cmd/Ctrl+K,
      filters to a navigation command, runs it and asserts the route, and checks
      Escape closes without navigating. Constant export tests stay until an audit
      replacement fits the rules.
- [ ] Address import-time timeouts with the established static-import pattern if
      reproduced; do not merely raise all timeouts. Converted so far:
      `packages/db/src/browser.test.ts` and `packages/extensions/src/index.test.ts`.
      Remaining lazy imports (`migration`, `reader` tests importing `@app/db`;
      `cache` importing its own constants) load small graphs and have passed
      repeated CI runs; convert them only if they actually time out. Run configured
      gates and commit.

## S6: Remote hygiene (R6 remote)

GitHub flow: short-lived branches, PR into `main`, delete branches once merged
(D7). Separate reversible inventory from destructive deletion. No implementation
dependency.

- [ ] Read current branches (`git ls-remote --heads origin`), open PRs and the
      default branch (`main`). Reconcile both local-only commits first.
- [ ] For each candidate, show current tip, related PR, merge/superseding commit and
      unique commits relative to the accepted recovery tip and `main`. Names and age
      do not prove a branch is dead; squash merges need content/PR reconciliation.
- [ ] Present an exact keep/delete/archive table (user expects most abandoned phase
      branches to be deletable, but `main` is never a candidate). Retain active
      recovery, anything with unique unmerged work, tags, and any branch a live PR
      targets. Ask before closing PRs or deleting refs.
- [x] First cleanup executed 2026-10-12: deleted 14 merged/superseded remote
      branches (`feat/phase-8-app-shell`, `feat/phase-9-*` ×10,
      `feat/web-desktop-migration`, `chore/update-dependencies`,
      `feature/add-discover-page`) after per-branch evidence review; remote refs
      re-read afterward. Open PRs #24–#26 and their branches remain.
- [x] Second cleanup executed 2026-10-13 (user pre-authorized): every remaining
      branch reconciled by PR/evidence. Remote now holds only `main` (branches of
      merged PRs #34–#38 auto-deleted on merge). PRs #24 and #25 closed as
      superseded with evidence comments (the recovery reimplemented their areas;
      #25's dev scaffold was retired by #36) and their branches deleted. All 17
      stale local branches pruned after per-branch reconciliation; only `main`
      remains locally.
- [x] `develop`: observed gone from `git ls-remote --heads origin` on 2026-10-13
      (deleted by the user from their own terminal); no longer blocked. #26 also
      merged, so the earlier "open PRs #24–#26 remain" note is fully resolved.
- [ ] Never apply history rewrite, force push, broad wildcard deletion or local
      user-work removal to this cleanup; only named, evidence-backed refs.

## S7: Publication readiness

Depends on S1–S4 and truthful docs. Vercel is the likely free target (D8), but
confirm the plan/domain before deploying, then validate its runtime/static assets,
HTTPS/browser storage, the same-domain rewrite if one was needed in S3, security
headers, first-run flow and image access at the deployed origin. Browser-local data
is origin-scoped, so state what carries over. Keep Electron unchanged unless a
shared-package regression requires a compatibility fix. Deployment is not authorized
by approval of this plan; respect host/workspace grants.

## Exit criteria per implementing session

One slice, real RED/GREEN, configured gates, built-app observation, reviewed diff,
local commit or the user's specified delivery endpoint. Report measured vs inferred
results, remaining requirements and any blocked verdict. Update checkboxes only with
observed evidence. Stop for a new consequential choice or blocker, not to ask “continue?”.

This document is a sequenced handoff, not a promise that the app is already fixed.
The author performed only S0; no remaining runtime implementation belongs in this
planning session.
