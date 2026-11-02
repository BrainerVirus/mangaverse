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

Next is milestone 2 (Electron runtime): ADR #209 first, then #210-#214, with #215 last. The roadmap holds
the order inside that range. #209 is waiting on the owner, below.

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
  `@tanstack/react-db` to exactly `1.0.0-rc.1.1`. It is added when #209 first needs it, because `knip` fails on an unused dependency.

## Waiting on the owner

| Needed                                              | Blocks                    |
| --------------------------------------------------- | ------------------------- |
| Two or three visual references                      | #228                      |
| Two or three real recipe sources to test            | #217                      |
| Supabase project                                    | #225                      |
| Code-signing decision                               | #215 (signed builds only) |
| Cloudflare access and go-ahead for the gateway test | #231                      |
| Legal advice before any public or gateway use       | #232                      |
| Confirm reference laptop and provisional budgets    | #209                      |

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
