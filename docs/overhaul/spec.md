# App overhaul - spec

This is the umbrella spec. It wins over `docs/recovery/` where they conflict. `docs/SPEC.md` still lists
the product's features; these files set priority and the rules for finishing them. Delivery order and
issues are in [roadmap.md](roadmap.md). Current state for the next session is in
[handoff.md](handoff.md).

| Spec                                                          | Covers                                             |
| ------------------------------------------------------------- | -------------------------------------------------- |
| [1. Engineering rules](01-engineering-rules.md)               | State and error bans, Effect, deslop, packages     |
| [2. Feedback and telemetry](02-feedback-and-telemetry.md)     | Status pages, Sonner, middleware, local log        |
| [3. Layout](03-layout.md)                                     | Responsive fixes on current screens                |
| [4. Electron runtime](04-electron-runtime.md)                 | Data process, native storage, network, packaging   |
| [5. Providers](05-providers.md)                               | Transport, manifest domains, recipes, user install |
| [6. Local data and downloads](06-local-data-and-downloads.md) | Query speed, local-first reads, downloads          |
| [7. Reader](07-reader.md)                                     | Reader engine and settings                         |
| [8. Sync](08-sync.md)                                         | Metadata and config sync between devices           |
| [9. Design](09-design.md)                                     | Playful liquid glass and the component registry    |
| [10. Web](10-web.md)                                          | Invite-only accounts, gateway, PWA, offline web    |

## Problem

A live audit (2026-10-31) found the app passes its suite but misses the product goal:

- Deployed web cannot reach MangaDex, and a page load with no server fails.
- Downloads do not exist. Third-party providers cannot run; installing one only stores its manifest.
- Failures leak raw text, and nothing tells users when work is saving, failed or retrying.
- Most E2E specs mock the network, so the suite cannot detect these problems.
- The reader opens slowly (about 2.1s), page turns reach 708ms, and webtoons are not detected.
- Layouts break at small sizes. The look is matte white, not playful liquid glass.
- 12 of 21 packages have one consumer, and several add no depth.
- Electron runs the web app unchanged: browser SQLite, renderer network calls, and no packaging.

## Product position

Two products share one UI and one set of recipes:

- **Electron is built first and is the complete product.** It runs on the device with native storage,
  direct network requests from the user's own IP, background downloads and user-installed providers.
  It needs no account and no external service to work.
- **The website comes later: free and invite-only.** It reaches providers through a Cloudflare gateway
  using approved recipes, and works on phones as an installable PWA. It may never match Electron.

There will never be a native mobile app. An optional account syncs library metadata and shareable
settings between devices. Page images never leave the device, and the host stores no pages.

```text
┌─ Electron ──────────────────────┐     ┌─ Website (invite-only) ───────┐
│ UI and recipes                  │     │ UI and recipes                │
│ Data process: native SQLite     │     │ Worker: browser SQLite        │
│ Page files on disk              │     │ OPFS page files               │
│ Network from the main process   │     │ Login and Cloudflare gateway  │
└───────┬───────────────┬─────────┘     └───────┬───────────────┬───────┘
        │ own IP        │ optional              │ shared IP     │
        ▼               ▼                       ▼               ▼
   Provider sites    Supabase ◄─── metadata sync ───────► Provider sites
```

## Decisions

| #   | Decision                                                                                                   | Why                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D1  | Electron first. Website later. No native mobile, ever.                                                     | Electron has no platform limits, so the core can be proven without compromises.        |
| D2  | Electron needs no account or external service for any local feature or provider access.                    | The app must keep working if every hosted service disappears.                          |
| D3  | One UI and one recipe format, with platform services for data, network and files behind interfaces.        | The website reuses the product instead of forking it.                                  |
| D4  | No hosted pages or shared page cache. Sync carries metadata and settings only.                             | Hosting copies makes the host a distributor. Metadata is light and the most important. |
| D5  | Recipe providers first: data, not code. Only the owner approves recipes for web; Electron can install any. | Recipes cannot run arbitrary code, and web recipes use a shared gateway.               |
| D6  | Web uses Supabase for invite-only accounts and a Cloudflare gateway, with no Vercel or Redis.              | Free at small scale. Gated on a real-site test the owner has deferred.                 |
| D7  | No rotating hosts or proxy pools to evade blocks, no spoofing, and no anti-bot circumvention.              | Respects site decisions and protects accounts.                                         |
| D8  | Drop SSR for web. Electron and web load a client-rendered shell.                                           | The database is on the client, so SSR renders nothing useful.                          |
| D9  | Repositories run in one data host: an Electron utility process, later a browser Worker.                    | Keeps the UI responsive and removes snapshot merging. Needs ADR 0001.                  |
| D10 | `useState` and `try/catch` banned by lint with a shrinking baseline, replaced by a local reducer hook.     | Stops new violations while old ones are migrated.                                      |
| D11 | Effect 4 for I/O modules only. Zod stays for schemas. TanStack stays for routing and queries.              | I/O needs retries, cancellation and typed errors; rendering and gestures do not.       |
| D12 | Consolidate to about 8 packages. Advanced features move under an "Advanced" section.                       | Removes seams nothing varies across and simplifies first use.                          |
| D13 | Telemetry is local-only and redacted. Nothing leaves the device.                                           | Reading data is private.                                                               |
| D14 | Reader has three levels: defaults, quick panel, advanced.                                                  | Great with no setup, with every detail tunable.                                        |
| D15 | Rewrite `DESIGN.md` for playful, welcoming liquid glass. Concept screens are approved before UI code.      | Replaces "calm, deep", which conflicts with the goal.                                  |

## Limits the product must state plainly

- Sites may refuse requests. Electron users see this per site, one user at a time. On web, a block on the
  gateway affects every web user of that provider, and Electron is the supported alternative.
- Running on the user's device reduces copyright exposure but does not remove it. The core app bundles
  no scrapers, and any registry stays separate. Get legal advice before anything public, especially for
  the gateway, which fetches and transmits pages itself.
- Sync stores library and reading progress on Supabase, so the owner's project can read it. Users should
  be told before they sign in.
- Web-only limits are in [spec 10](10-web.md).

## Not audited yet

Electron launch and packaging, real iOS and Android devices, dark mode, and real pinch and swipe. Each
is checked when its spec ships.

## Out of scope

Native mobile apps, hosted pages, remote telemetry, and public launch of the website.
