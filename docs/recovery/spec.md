# Web-first recovery: spec

Date: 2026-10-12.

Status: handoff specification. Only the S0 startup slice is implemented; the rest
is planned and unproven.

## Problem and evidence

MangaVerse has a broad migrated feature inventory, but that is not acceptance of
a publishable reading app. Recover the narrow reading journey before extending
the migration or polishing Electron.

Measured in this planning session:

- The initial production build exited successfully but the running app requested
  a development-only entry and failed to hydrate. SSR also failed on `tslib`
  interop. Commit `f15be8c` repairs startup and adds a built-app Chromium test.
- Configured tests, typecheck and lint passed after repair; unchanged tasks used
  Turbo cache. Lint retained 62 warnings. One import-time test timed out under
  parallel check load, then passed without modification. A seasonal test needed
  a fixed clock because it assumed Spring while running in October.
- Static inspection found fresh in-memory SQLite initialization, development-only
  provider seeding, and MangaDex requests implemented in the app shell. Durable
  restart behavior and production provider availability are not established.
- Existing catalog E2Es reach chapter listing, not actual reading. An automated
  audit flagged constant-only tests, an assertion-free reader test, over-mocking,
  and duplicate reduced-motion tests. These findings are triage inputs, not
  permission to remove behavior coverage.
- Knowledge lint reports root agent instructions at 13,429 bytes, exceeding its
  8 KB budget. Historical completion claims disagree with recovery gaps.
- Remote inventory has 19 branches and open PRs #24, #25 and #26. No branch was
  deleted. Unique-commit ancestry remains unchecked.

## Decisions

| ID  | Decision                                                                                             | Reason                                                               |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| D1  | Web is primary; Electron is a later installable alternative.                                         | User confirmed publication of a working web app is the priority.     |
| D2  | Use the existing MangaDex official API approach first.                                               | Prove one real source without adding HTML-scraping breakage.         |
| D3  | Finish planning here; another model implements the remaining slices.                                 | User explicitly requested a cheaper-model handoff.                   |
| D4  | Repair incrementally; preserve existing data, IDs and unique Git work.                               | A clean restart means a trustworthy baseline, not destructive reset. |
| D5  | Multi-tab is transparent: concurrent tabs must converge safely with no lockout screen.               | User decision; a lockout UX is rejected for this app.                |
| D6  | Keep app and any needed network proxy same-origin (Vercel rewrite); no permissive third-party proxy. | User decision; same-domain requests avoid CORS entirely.             |
| D7  | Follow GitHub flow: short-lived branches, PR into `main`, delete merged branches.                    | Matches the user's other repository workflow.                        |
| D8  | Publication is a later Vercel target, decided after the full local feature set works.                | User decision; not part of recovery acceptance.                      |

D1/D2 are recorded in Workit decision `8b698970-0510-4d4c-b107-df4804591e60`;
D3 in `3d7956bc-6c33-40ac-adc5-9765b24b09c6`; D5–D8 in
`e95ea9c2-21cb-4179-bb10-f02192e06cbc`. D4 is the safety constraint for this plan;
exact remote deletion candidates still need per-branch confirmation.

## Required behavior

### R1: Production startup

- Given a fresh production build, when opened in a browser, then it hydrates,
  initializes local storage and presents interactive onboarding without HTTP 500
  responses or development-only asset dependencies.
- Given an initialized installation, when reloaded, then onboarding completion
  remains recorded and does not force a fresh setup.

The first scenario is covered by the completed startup slice. The second depends
on durable storage and is not yet accepted.

### R2: Durable browser SQLite

- Given saved library entries, providers, preferences and chapter progress, when
  the page reloads or the browser context is reopened at the same origin, then
  those records remain available with their original IDs.
- Given a failed durable write, when a mutation completes, then the app does not
  falsely report durable success; it exposes an actionable failure and preserves
  the previously committed snapshot.
- Given corrupt stored data or a migration failure, when startup runs, then it
  reports recovery guidance without overwriting the original bytes with an empty
  database. Export/recovery access must remain possible.
- Given two open tabs, when both make changes, then both tabs converge to a safe
  merged state, no tab is locked out, and neither tab's committed writes are
  silently discarded. A tab opened later must see changes committed by an earlier
  one without a manual reload.
- Given a transaction that rolls back, when reopened, then none of its partial
  writes are present. Committed writes must not rely solely on unload callbacks.

### R3: Built-in provider

- Given a fresh production installation, when initial setup completes, then the
  built-in MangaDex integration can be enabled and used without a dev server.
- Given an enabled provider, when searched, then normalized results lead to details,
  complete supported chapter lists and ordered page data.
- Given a disabled provider, when search or a remote refresh is attempted, then no
  provider request is made. Startup must not silently re-enable it.
- Given invalid responses, offline access, rate limiting or service errors, when
  a provider operation fails, then a normalized error and retry path appear;
  failure is not disguised as a successful empty chapter.
- Given cancellation or changed search input, when the old request finishes, then
  it cannot replace the current result or perform stale persistence side effects.

### R4: Read and resume

- Given a title with readable chapter images, when a chapter is opened, then the
  reader shows a decoded first image, the correct page count and source attribution.
- Given an open chapter, when keyboard or tap navigation is used, then the page
  changes once in the configured direction; controls and overlays do not also
  trigger reader navigation.
- Given a changed viewport, when resized, then the active reading position is
  preserved rather than reset to the initial page.
- Given a saved position, when leaving and reopening after reload, then the reader
  resumes there. A fast exit must checkpoint pending progress, with failures visible.
- Given all chapter images were successfully cached, when reopened offline, then
  those images render without a remote dependency. Partial caching must show which
  pages are unavailable rather than claim the chapter is fully offline-ready.
- Given failed or expired remote image URLs, when retried online, then page-source
  metadata can be refreshed without destroying progress or good cached images.

### R5: Valuable tests

- Given a broken production handler, missing image, wrong page order, lost restart
  data or ignored provider disable state, when its acceptance test runs, then the
  test fails for that behavior, not an incidental implementation detail.
- Given a live-source outage, when deterministic CI runs, then fixture-based tests
  remain reliable; a separate live smoke run reports the outage without rewriting
  fixtures or weakening assertions to make tests green.

### R6: Documentation and remote hygiene

- Given a new implementation session, when agent instructions are read, then they
  point to the active recovery sequence and do not claim all migrated flows work.
- Given a branch proposed for deletion, when cleanup is approved, then its current
  remote tip has been reconciled against merged/superseding work and protected refs
  remain unchanged. Unmerged unique work is retained or explicitly archived.

## Design constraints

Reuse the current React/TanStack/SQLite packages. Database persistence belongs
behind the database interface with platform-specific byte storage behind a seam;
do not spread export calls across UI mutations. A stored SQL.js byte snapshot alone
is insufficient: define when a write becomes durable and how errors propagate.
The existing synchronous SQLite transaction callback must not become async.

Provider-specific mapping and network validation belong in a provider package,
not routes or reader visuals. Reuse the SDK's actual contract, controlled request
helpers, capability validation and normalized errors. Query cancellation belongs
to each invocation, not a permanently captured factory signal.

The reader receives normalized chapter data and emits progress, without knowing
MangaDex. Persistent records and image blobs have different storage lifecycles;
clearing caches must not erase library/progress/settings. Page URLs are refreshable
metadata, not permanently valid offline resources.

Do not freeze a database driver or persistence algorithm without a small browser
proof. Recommended first evaluation: retain SQL.js and existing repository contracts
and use IndexedDB for durable bytes. Because the machine is a whole-snapshot store,
concurrent tabs must merge safely rather than last-write-win: every committed
operation must be journaled or replayed so two tabs do not discard each other's
committed work, and a later tab must observe earlier committed changes without a
reload. If snapshot storage cannot satisfy that transparent convergence through the
present interfaces, compare a persistent WASM driver before committing to a fragile
method-interception layer. No lockout screen: multi-tab is a supported path, not an
error state.

Network access must stay same-origin wherever providers are called from production
browser code. MangaDex's public API and image host currently send permissive CORS
headers, so direct calls are the first probe; a same-domain rewrite (for example a
Vercel rewrite from `/api/mangadex/*` to the MangaDex host) is the preferred fix if a
probe fails (regional block, header change, image host difference) or if a later
provider requires it. Never add an unrestricted proxy: restrict targets and redirects,
block private addresses, validate input, bound sizes/timeouts and rate-limit access.

Built-in MangaDex approval does not authorize arbitrary third-party code execution.
Make its bundled origin, capabilities and disable control visible. Community
provider installation continues to require explicit confirmation.

## Remaining consequential choices

1. Browser network path: probe live API and image CORS from the production browser
   first. Only if a probe fails, choose the same-domain rewrite shape (rewrite target,
   dev-server equivalent, size/timeout/rate limits). Never an arbitrary-URL proxy.
2. Publication specifics: the Vercel target is intent, not a decision. Confirm the
   hosting plan, domain and whether local data should move when the origin is fixed;
   browser-local data is origin-scoped, so do not promise automatic transfer.
3. Remote cleanup: the GitHub-flow convention is set; the exact per-branch
   keep/delete table still requires user approval before deletion.

## Out of scope

Electron polish/packaging, new scraping sources, provider authentication, arbitrary
extension execution, cloud sync, full rewrite, new visual themes/motion, and full
parity with every historical reader setting. Unsupported reader controls must not
be presented as working; RTL/LTR page reading is the initial acceptance target.
Webtoon/zoom/spread acceptance follows separately if not already proven.

## Release acceptance

R1–R5 must pass on the built web app, with actual image decoding and fresh browser
contexts. Run one documented live journey using a currently accessible chapter
with appropriate content permission. Record what was observed, unavailable, or
inferred; successful fixture tests are not proof of live MangaDex connectivity.
R6 is required for honest handoff, but destructive remote cleanup need not block
the first functional web release.
