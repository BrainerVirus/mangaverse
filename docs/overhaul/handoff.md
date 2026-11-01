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
- TanStack DB is the UI data layer on Drizzle and SQLite, not a replacement. npm `latest` was `1.0.0-rc.1.1`
  when decided, so pin it and check for a stable 1.0.

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

## Loose ends

- **Stopped wave 1 workers:** `mangaverse-wt/telemetry-log`, `provider-proxy` and `responsive-fix` hold
  uncommitted, unverified work on branches with no commits. The old `overhaul-wave-1` fanout plan and its stop
  order are obsolete, so don't resume it. `telemetry-log` may be a useful reference for #205; the others predate
  this design. The owner has not yet decided whether to discard them.
- **Audit worktree:** `app-audit` holds nothing beyond the merged docs and can be removed.
- **Main checkout:** another session uses it, and it was still on a merged branch at last check. Don't touch it.
- **Docs:** `docs/recovery`, `docs/PLAN.md` and `DESIGN.md` still describe the old direction until #208 and #229.
