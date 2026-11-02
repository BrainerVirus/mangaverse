# App overhaul - handoff

Current state, rewritten when #208 landed. Delete this file when its contents stop being current.

## Where things are

Milestone 1 (Foundation) has landed:

| Issue | State                                                                                 |
| ----- | ------------------------------------------------------------------------------------- |
| #204  | Landed: `useState` and `try/catch` frozen by a shrinking baseline; `useStateReducer`. |
| #205  | Landed: local, capped, redacted event log and Diagnostics view.                       |
| #207  | Landed: responsive layout repairs and the virtualized chapter list.                   |
| #206  | Landed: typed failures, status pages, inline retry, toasts, the Saving indicator.     |
| #208  | Landed: package consolidation, below.                                                 |

Milestone 2 (Electron runtime) is complete pending #215's merge:

| Issue | State                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #209  | Landed: [ADR 0001](adr/0001-data-host.md) decides `node:sqlite` through a small adapter, sync-in-host, a generated client with the repositories' names, and TanStack DB change events; `better-sqlite3` 13 is the tested exit.                                                                                                                                    |
| #214  | Landed: the production app loads a static client shell from `app://` with a strict CSP; the Nitro fork, loopback port and local Express service are gone. Offline deep routes are proven; dev still uses Vite.                                                                                                                                                    |
| #210  | Landed: repositories run in a `node:sqlite` utility process behind typed procedures; the renderer uses the same names; an existing snapshot imports once with counts and content verified; change capture broadcasts to every window, the library tracer runs on TanStack DB, chapters load on demand, and a crashed host restarts with no data lost.             |
| #212  | Landed: reader pages are files under a main-owned store, served by `page://` with opaque ids and app-frame-only access; SQLite holds only metadata; eviction removes files and rows together; web keeps IndexedDB and object URLs.                                                                                                                                |
| #211  | Landed: provider HTTP runs in main behind the manifest-domain allowlist and a pinned-address transport; the renderer has no provider network path, and page/cover bytes are fetched and stored by main. See below.                                                                                                                                                |
| #213  | Landed: the one-way renderer-data import moves IndexedDB pages and covers into the page store, rewrites cache pointers inside the verified snapshot import, and surfaces retry/export. See below.                                                                                                                                                                 |
| #215  | Landed: the packaged macOS app runs from a self-contained asar (main, data host, migrations and preload bundled by esbuild), an unsigned dmg/zip builds, and electron-updater asks in the renderer and defers while a chapter is open. Windows/Linux package in CI only; install proof there, signed builds and the reference laptop stay owner-gated. See below. |

Packaging closes milestone 2. Budgets stay provisional: #215 did not pin the reference machine, and
Windows/Linux installs remain unproven. Check `node:sqlite` on Windows and Linux before claiming those;
if it fails, take ADR 0001's `better-sqlite3` exit.

## Data host events (#210 part 2)

- Temp triggers on seven synced tables (`SYNCED_TABLES` in `packages/db/src/data-host-protocol.ts`) record
  committed row changes, FK cascades included, into a temp table on the host's connection. A rollback takes
  them with it. They are installed once at open and drained after every call; nothing reaches the file.
- After each reply the host sends `{ kind: 'changes', seq, changes }` to every attached port, the caller's
  too. A failed call still sends what it committed. One change per row.
- Library tracer: the library page reads its titles, categories and providers through three host-fed
  collections (`apps/web/app/lib/host-collections.ts`, `features/library/library-collections.ts`). A relevant
  change reloads a list whole, as one snapshot, because the host owns its filter and order. The bulk bar's
  status and favorite edits are optimistic: they apply at once, keep their value until the host's rows
  replace them, and roll back with a typed error and the existing save toast when the host refuses. On the
  web and the sql.js fallback, every local write sends `resync` instead.
- Chapters: `listChapterWindow` takes a required limit up to 500 and the host refuses anything else;
  `createChapterWindowCollection` loads one title's bounded window on demand. No surface reads it yet.
- Crash recovery: calls time out after 30 s (open: 300 s) with `data-host.timeout`. Main restarts a host
  that exits (250 ms backoff doubling to 8 s, giving up after 8 quick crashes) and hands each connected
  window a new port. The window reopens the host before any later call reaches it, its collections
  resync, and a toast tells the user. A call caught in the crash is not resent.
- Live proof (`apps/desktop/e2e/live-collections.spec.ts`): two windows edit live; a refused edit rolls
  back; a hung, then killed host restarts in about 0.4 s and both windows are told; `kill -9` in the middle of
  a write stream loses no acknowledged write, and `integrity_check` is ok.

### Follow-up: the per-surface migration

Only the library list moved. 53 TanStack Query read sites and 46 mutation sites were counted before this
change; apart from the library page's list read and the bulk status and favorite edits, all of them still
run on Query and do not update live across windows. Move them surface by surface onto host-fed
collections, then drop the Query cache patches in `features/library/optimistic-library-cache.ts` and the
library page prefetch in `queries/prefetch-core-local-data.ts`, which still warms a Query nobody reads.
After a reconnect, Query caches are not invalidated; they refetch on their own stale time.

Carried from #209 and still open: `listLibraryEntries` takes 300 ms or more on the seeded dataset on every
driver, over the 100 ms budget, and each library reload runs it.

## Provider network (#211)

- Main keeps `providerId -> manifest domains` in `provider-allowlist.ts`. The app frame sends a
  complete enabled-provider snapshot over typed `replace` IPC at startup and after every install,
  import, enable, disable and uninstall; main replaces its whole table with that snapshot (so ids
  absent from it lose access), ignores a strictly older revision, and refuses an unknown provider or
  undeclared host. A request never carries domains.
- `main-process-fetch.ts` resolves every address, rejects private, loopback, link-local, unspecified
  and multicast answers (IPv4 and IPv6, including mapped forms), and connects to the validated
  address through a pinned `lookup`, so a second DNS answer cannot redirect the socket. The allowlist
  and address check run before every redirect hop; limits are 5 redirects, 64 MB and 60 s, and a
  refusal is logged with the host only.
- `providerNetworkRequest` returns status, filtered headers and a bounded body; `provider-fetch.ts`
  adapts it to `Response` for `createMangaDexProvider`, so the SDK client, rate limiter and error
  normalization are unchanged. `providerNetworkStore` fetches and writes a page or cover in main and
  returns a `page://` URL plus metadata, so no cached image bytes cross IPC on desktop. A
  user-supplied custom cover uses `providerNetworkStoreUserInitiated`: it has no manifest allowlist,
  but still enforces the public-URL, redirect, size and time checks.
- The first-party MangaDex manifest is `0.1.1`, and startup also refreshes a same-version stored copy
  whose network domains or checksum differ, so pre-network installs gain the allowlist instead of
  staying denied.
- The production CSP is `connect-src 'self'` and `img-src 'self' data: blob: page:` (no `https:`);
  dev adds only the Vite origin and its ws origin. User-initiated manifest/registry URLs and update
  checks go through main's SSRF-checked byte fetch rather than the renderer.
- Proof: unit tests cover the SSRF matrix, allowlist, rebinding, redirects and limits;
  `apps/desktop/e2e/provider-network.spec.ts` covers Discover, covers, chapters and reader pages from
  the dynamic `*.mangadex.network` baseUrl, a private target and a private redirect refused before
  connecting, and the renderer's own provider fetch CSP-blocked. A live run against
  `api.mangadex.org` returned 200 for search, detail, cover and page fetches with no console errors.
- The E2E fixture transport (`provider-network-fixture.ts`) is enabled only by main's
  `MANGAVERSE_E2E_PROVIDER_FIXTURE` environment; every allowlist, address, redirect and limit check
  still runs.

## Renderer-data import (#213)

- One coordinator runs before the data host opens on first start (`renderer-data-import.ts`). It
  lists the old IndexedDB blob keys (`page:`/`cover:`), reads each one, writes it through main's
  page-store IPC, and asks main to hash the file it wrote; a size or SHA-256 mismatch fails the
  move. Covers move from `cover:<p>:<m>` to `page:cover:<p>:<m>`.
- The snapshot import (#210) takes the pointer rewrites in the same `open` request and applies them
  to both the scratch source and the copied database before the counts and hashes are compared, so
  the verified file already points at the page-store files. A #210 profile whose native file
  already exists gets the same rewrites through `rewriteCacheBlobKeys` in one transaction.
- Nothing is deleted before verification. The old snapshot and blobs stay in IndexedDB; after the
  marker (`mangaverse.sqlite.import-renderer.json`) normal cache maintenance may reclaim the old
  cover copy, and the page copy stays as the backup. Custom covers are moved like every other cover;
  their pointer is the URL in `manga_identities.user_overrides_json.coverImageUrl`, which needs no
  rewrite, and the cached bytes row is `cache_entries.blob_key`.
- A failure before the host opens leaves no native file, so the window keeps working on sql.js. A
  failure after it opens keeps the native database; either way the library/settings banner shows
  the error, **Retry import** (user-initiated: it resets the local DB and runs the coordinator
  again) and **Export old data** (the snapshot bytes as base64 plus a blob inventory). There is no
  console-only path and no automatic retry loop. A marker whose native file is missing is not
  trusted: the move runs again.
- Tests: unit coverage for the move, verification, retry, marker and export; host tests for the
  in-import rewrites; `apps/desktop/e2e/renderer-import.spec.ts` seeds a pre-data-host profile and
  proves library, custom cover, reader page, the marker, a second-start skip, and a forced
  read-only page-store failure with retry/export.

## Package consolidation (#208)

Slices, in landing order: dead weight (#244), helper dedupe (#246), the advanced hub and URL aliases (#247),
backup, diagnostics and storage (#248), onboarding and migration (#249), settings and theme (#250), library
and search (#251), the keep-package merges (#252), and this docs sweep.

`packages/` now holds eight packages (E6):

- `shared`, `db`, `platform`, `reader`, `extensions-sdk`.
- `cache`, kept because `reader` imports it.
- `design-system`, which holds motion at `src/motion`, imported as `@app/design-system/motion`.
- `extensions`, which holds `@app/extensions/core` at `src/core` and `@app/extensions/mangadex` at
  `src/mangadex`.

Everything else is under `apps/web/app/features/`: backup, diagnostics, library, migration, onboarding,
search, settings, storage and theme. `theme` moved there because it imports `@app/db`, which the
`design-system` boundary forbids.

## How failures work now (spec 2)

- `classifyAppError` in `@app/shared` is the only thing that turns a failure into UI text. Routes
  use `failureMessage` or `actionFailureMessage` from `apps/web/app/lib/app-feedback.ts`, never
  `error.message`.
- Queries and mutations declare `meta.feedback`; the caches in `query-provider.tsx` classify, log and
  toast. A user's save uses `saveFeedback(...)`. Failures with no `meta` only reach the log.
- Toasts go through `notify` and `Toaster` in `@app/design-system`. Nothing else imports Sonner.

## Advanced section (#208 E7)

- Theme editor, Diagnostics and Migration live at `/advanced/theme`, `/advanced/diagnostics` and
  `/advanced/migration`, under the `/advanced` hub. `/theme/editor`, `/diagnostics` and `/migration`
  stay as redirect aliases; `/migration` forwards raw search params so the target reports a bad link.
- Identity merge and "Migrate selected" sit behind a closed `SettingsSection`.

## Known gaps

- The Saving toast is live for every mutation with `saveFeedback`, but the theme editor and provider
  settings forms still change their button label while pending, so it can flash on a fast save. The
  fix belongs in `apps/web/app/features/theme` and `@app/extensions`.
- `apps/web/app/features/theme/components/ThemeAdvancedEditor.tsx` renders a caught export error's `.message`
  itself, outside the route layer. Fix it when that feature is next changed.

## Start here

1. Read [spec.md](spec.md), [roadmap.md](roadmap.md), then the spec for your issue.
2. Run implementers, verifiers and reviewers on the models in `workit models show`, and set them
   explicitly when launching. Text in a brief does not select a model.

## What was settled

Recorded in the Workit ledger with `workit ledger list --type decision`, and in the specs.

- Electron first and complete, with no account or external service required.
- Website later: free, invite-only with Supabase, through a Cloudflare gateway.
- Sync metadata and shareable settings only. Page images never sync or get hosted.
- No native mobile, phone bridge, browser extension route, paired helper, Vercel or Redis.
- No rotating hosts or anti-bot circumvention.
- TanStack DB is the UI data layer on Drizzle and SQLite, not a replacement. Pin `@tanstack/db` and
  `@tanstack/react-db` to exactly `1.0.0-rc.1.1`. The #209 spike installed it in a throwaway directory, so product code adds it on first use, because `knip` fails on an unused dependency.

## Packaging (#215)

- **Self-contained asar.** `apps/desktop/scripts/bundle-main.mjs` esbuild-bundles `src/main/index.ts`
  and `src/main/data-host-process.ts` as ESM, keeping only `electron` external; the preload bundle is
  unchanged. `packages/db/migrations` is copied to `dist/main/migrations` and main points the data host
  at it through `MANGAVERSE_MIGRATIONS_FOLDER`, because bundling moves `import.meta.url` out of the
  package. The asar list is 114 entries: `dist/main`, `dist/preload`, `dist/renderer`, the migration
  SQL and `package.json`; no `node_modules` or workspace symlinks. `electron-updater` is inlined into
  `dist/main/index.js`, so the asar needs no runtime dependency tree.
- **Installers.** `apps/desktop/electron-builder.yml` sets appId `app.mangaverse.desktop`, `asar: true`,
  mac dmg/zip, Windows NSIS, Linux AppImage/deb, artifact names and a GitHub publish feed for
  `BrainerVirus/mangaverse`. Builds are unsigned by default: with no `CSC_LINK`/Apple credentials
  electron-builder skips signing and notarization, and macOS still runs the local build. The packaged
  `MangaVerse-0.0.1-arm64.dmg`/`.zip` were produced locally (unsigned) with `app-update.yml` and
  `latest-mac.yml`. `electron-builder` is a devDependency, `electron-updater` a runtime dependency.
- **Update flow.** A check runs 30 s after ready and every 6 h, never on the startup path, and only in a
  packaged build that ships `app-update.yml`. `autoDownload` is on, so a found release downloads in the
  background and main asks the renderer only once it is on disk: `platform:update:available` carries a
  release the dialog can install immediately. `autoInstallOnAppQuit` is off, so nothing installs without
  "Restart and install"; `ReaderLayout` sends the reader-active signal, and main holds both the prompt
  and an accepted install while any window is reading. A reload, a crash or a closed window clears that
  window's reading state, so a reload mid-chapter cannot pin the update. A declined version is not
  offered again this session, and a failed check or download only logs once (electron-updater emits
  `error` before rejecting, and the rejection plus any `downloadPromise` rejection is swallowed).
  `update-policy.test.ts` covers ask/idle, defer while reading then ask, declined no-loop, a newer
  release after a decline, and quiet failures; `updater.test.ts` covers the IPC wiring and lifecycle.
- **CI.** `.github/workflows/package.yml` runs on manual dispatch, `v*` tags and pull requests that touch
  `apps/desktop/**`, `apps/web/**`, `packages/**`, the workflow itself or the workspace manifests, with a
  macos/windows/ubuntu matrix: install, build, `package:<platform> <arch flags> --publish never`, upload
  artifacts. The arch flags are passed without a `--` separator because pnpm forwards that literally and
  electron-builder then ignores the whole list, silently building the runner's own arch. Secrets are
  injected only when present; absent secrets build unsigned and do not fail the job. Windows and Linux
  are **build proof only** — not installed or launched.
- **Packed macOS proof** (`apps/desktop/e2e/packed-app.spec.ts`, `pnpm --filter @app/desktop test:e2e:packaged`):
  the zip was extracted to `release/packed-proof` and `MangaVerse.app` launched from there, offline.
  Observed: `app://app/library` deep route renders the imported title; the one-way renderer import
  records its marker and the data host serves the library; `page://` serves a stored page into an
  `<img>`; the app log says `[updater] enabled`; a plain launch sampled for 8 s opens no listening TCP
  port. Provider traffic is proven by the unpackaged E2E (`provider-network.spec.ts`), which seeds a
  fixture; the packaged app ignores `MANGAVERSE_E2E_PROVIDER_FIXTURE` because main reads it only when
  `app.isPackaged` is false.
- **Still owner-gated:** certificates and notarization secrets (signed builds), the reference laptop and
  final budgets, and Windows/Linux install and `node:sqlite` proof. None of those are claimed here.

## Waiting on the owner

| Needed                                              | Blocks                    |
| --------------------------------------------------- | ------------------------- |
| Two or three visual references                      | #228                      |
| Two or three real recipe sources to test            | #217                      |
| Supabase project                                    | #225                      |
| Code-signing decision                               | #215 (signed builds only) |
| Cloudflare access and go-ahead for the gateway test | #231                      |
| Legal advice before any public or gateway use       | #232                      |
| Confirm reference laptop and provisional budgets    | #215 (final numbers only) |

## Evidence to reuse

- Audit method: production build on a `localhost` origin, because MangaDex sends CORS only to `localhost`
  origins, using a real title such as `dev-md-5b6853e2-8173-43ad-afe5-f091da2e6089`.
- Measured: chapter open about 2.1s, page turns 15-708ms, 138 chapter rows mounted.
- Save-cost benchmark on synthetic data: export under 8ms and IndexedDB write 24ms at 128 MB on a fast Mac.
  This is why storage migration is justified by responsiveness, not save time.
- Research was partly done on a low-effort model, and some sources are secondary or vendor blogs. Verify
  anything a decision rests on.

## Cleaned up

- The stopped wave 1 worktrees and the `overhaul-wave-1` fanout are retired. Don't resume them.
- The old plan, recovery ledger and `superpowers/` phase docs were deleted as dead weight (#208). Nothing
  archived is current guidance; `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `DESIGN.md` and `docs/Design.md`
  point here and lose on any conflict.
- Another session may use the main checkout. Leave it alone.
