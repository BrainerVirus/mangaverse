# App overhaul - handoff

Written 2026-10-31. No product code from this work has landed. Delete this file once milestone 1 starts
and its contents stop being current.

## Start here

1. Read [spec.md](spec.md), [roadmap.md](roadmap.md), then the spec for your issue.
2. Start with milestone 1. Issues #204, #205 and #207 can run in parallel. #206 follows #205, and #208 runs
   alone after all of them.
3. Run implementers, verifiers and reviewers on the models in `workit models show`, and set them explicitly
   when launching. Text in a brief does not select a model.

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
- Unverified telemetry work from that wave is on the local, unpushed branch `wip/telemetry-log-reference`.
  Treat it as a reference for #205, not as a base.
- The old plan and recovery ledger moved to `docs/archive/`. `docs/SPEC.md`, `docs/ARCHITECTURE.md`,
  `DESIGN.md` and `docs/Design.md` point here and lose on any conflict.
- Another session may use the main checkout. Leave it alone.
