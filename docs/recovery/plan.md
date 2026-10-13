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

- [ ] Write red production E2Es for fresh provider availability, search/detail,
      restart preservation and provider disable blocking all remote operations.
- [ ] Implement one explicit built-in registration path and provider resolution
      through installed/enabled state. Community manifests still require consent.
- [ ] Wire Query keys to source ID, query, language/content settings and page input;
      propagate invocation cancellation and prevent stale writes.
- [ ] Preserve `dev-md-`/`dev-md-ch-` identity relationships or migrate them explicitly
      with tests preserving library/progress. Do not duplicate existing titles.
- [ ] Probe actual API/image CORS from a production browser, not Electron/Node fetch.
      Direct calls first (MangaDex currently sends permissive CORS headers). If a probe
      fails, implement the same-domain rewrite (`/api/mangadex/*` shape) in both dev
      and the eventual Vercel config; stop and confirm the rewrite shape with the user.
      Never ship an unrestricted URL proxy.
- [ ] Migrate routes in small complete batches; delete old dev paths only after the
      replacement passes its production flow. Preserve useful fixtures while moving
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

- [ ] Create strict network fixtures for details/feed/at-home and distinguishable
      image pages. Reject unexpected endpoints; the catalog's broad catch-all mock
      can otherwise disguise a missing at-home implementation.
- [ ] Observe a red decoded-image/page-order test before repairing the reader.
      Assert `naturalWidth > 0`, page indicator, expected image identity, keyboard
      direction and tap result, not only a blob URL or absence of empty state.
- [ ] Cover resizing without position reset, chrome click isolation, immediate
      navigation away before the debounce expires, restart/resume and save failure.
- [ ] Preserve good cached images; refresh expired source URLs on retry and report
      partial caching accurately. Bound prefetch memory/concurrency.
- [ ] Prove fully cached offline reopening in a fresh context and first-open offline
      failure with an explicit retry. Do not mark cache completeness after failed fetches.
- [ ] Run deterministic production E2Es, gates and test audit; plant one wrong
      navigation/page-order change, observe failure, restore it, rerun. Commit.
- [ ] Run/document a separate live reading journey from a real production browser.

Audit leads, not confirmed runtime diagnoses: ReaderScreen reinitializes on changed
viewport/session input, cancels debounce on cleanup, and observes pointer events
above chrome. Reproduce each before fixing; pure helper tests alone do not prove UI.

## S5: Focused test/doc cleanup (R5, R6 docs)

Suggested branches: three small instruction-file commits in one cleanup PR,
followed by a separate behavior-test cleanup slice. Independent of S2; do not let
this expand into rewriting the whole repository before S1–S4.

Touches: `AGENTS.md`, `docs/PLAN.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`,
the June MangaDex spec, and only tests with triaged audit findings.

- [ ] Remove duplicated phase history, stale “tests passing” counts and no-op prose.
      Retain security/data-loss/accessibility constraints. Put historical status in
      existing docs or Git rather than adding a second completion ledger.
- [ ] Add short pointers to this spec/plan and correct current-vs-target platform
      wording. Each added instruction names the content it replaces; stay under 8 KB.
- [ ] Move judgment rules behind topic pointers only when useful; encode mechanical
      package-import/provider-location rules as executable checks, not repeated prose.
- [ ] Run `workit knowledge lint` before/after each instruction commit; no new finding.
      Canonical commands for production build/start/E2E already exist in
      `apps/web/package.json` and the root scripts; keep them current.
- [ ] Audit targeted suites and triage every finding by naming the production break.
      Remove only assertion-free or truly duplicate tests after checking coverage;
      replace bad oracles and prove replacements fail on planted bugs.
- [ ] Keep constant export tests until a replacement/removal fits audit rules; don't
      treat a constant-only flag alone as permission to delete. Add a real command
      palette interaction test before claiming navigation coverage.
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
- [ ] `develop` deletion is blocked by the host's protected-branch guard. It has
      zero unique commits and is safe to remove once the user deletes it from
      their own terminal (`git push origin --delete develop`) or GitHub settings.
      Do not treat it as deleted until observed gone from `git ls-remote`.
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
