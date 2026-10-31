# 4. Electron runtime - spec

## Problem

Electron loads the web router unchanged. SQLite is sql.js in the renderer, with whole-file snapshots in
browser storage. Provider JSON is fetched from the renderer under a security policy that hard-codes
MangaDex, while only image bytes cross IPC. Page blobs live in IndexedDB. The local Express service
exposes only health and diagnostics. The build embeds the Nitro server output for the renderer. It builds today, but has no packaging or auto-update dependency.

## Decisions

| #   | Decision                                                                                                     | Why                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| X1  | One data process: an Electron utility process owns native SQLite and runs the repositories.                  | The UI never blocks on the database, and a crash there cannot take the window down.                      |
| X2  | Repositories stay synchronous inside the data host. The UI calls them over a typed async RPC.                | Keeps Drizzle's sync API and `withTransaction`, avoiding a rewrite of hundreds of calls. Needs ADR 0001. |
| X3  | Native SQLite through `better-sqlite3`, confirmed by ADR 0001.                                               | Drizzle 0.45 has a sync driver with the same API family as sql.js.                                       |
| X4  | The main process makes all provider requests. The renderer has no direct network access to providers.        | Enforces domains in one place, with no CORS and the user's own IP.                                       |
| X5  | Pages are files on disk, served to the UI by a restricted custom protocol.                                   | Streams images with no blob copies over IPC.                                                             |
| X6  | IPC is the app's backend boundary, validated with Zod. Keep the Express service only if a real need appears. | Deletion test: nothing uses its HTTP today, and IPC needs no open port.                                  |
| X7  | Downloads and update checks run in the background while the app is open or in the tray.                      | Desktop has no iOS-style limits.                                                                         |
| X8  | Package for Windows, macOS and Linux with auto-update from GitHub Releases.                                  | An app nobody can install is not the product.                                                            |
| X9  | Renderer stays sandboxed with context isolation, a strict security policy, and no Node access.               | Providers and web content are untrusted.                                                                 |
| X10 | Existing snapshots import once into native SQLite. The old data stays until the import is verified.          | Protects data on a one-way move.                                                                         |

### ADR 0001: data host

Decide before building, with a small spike:

- How callers reach repositories. Today they pass a `db` handle to imported functions, so the likely
  shape is a generated typed client with the same names, running each call in the data host.
- `better-sqlite3` versus `node:sqlite` under Electron 44: native rebuilds per platform, and driver support.
- Whether the same RPC contract fits a browser Worker later (spec 10).

### Budgets

Provisional until measured on a mid-range laptop.

| Measure                                  | Budget |
| ---------------------------------------- | ------ |
| Launch to usable library                 | 1.5s   |
| Library of 1,000 titles: open and filter | 100ms  |
| Renderer blocked by a database call      | Never  |

## Behavior

- Given a fresh install, When the app opens with no network or account, Then onboarding and the library work.
- Given no account, When a provider is used, Then requests go directly from the main process.
- Given a request outside the provider's declared domains, When sent, Then the main process refuses it and logs it.
- Given the renderer tries to reach a provider directly, When it does, Then the security policy blocks it.
- Given a malformed IPC message, When received, Then it is rejected with a typed error.
- Given a slow query, When it runs, Then the UI keeps responding.
- Given the data process crashes, When it restarts, Then the UI recovers, shows what happened, and no committed data is lost.
- Given the app is killed mid-write, When it reopens, Then the database is intact.
- Given an existing sql.js snapshot, When the new version first opens, Then data imports exactly once and counts are verified.
- Given a failed import, When it happens, Then the old data is untouched and the app explains how to retry or export it.
- Given a cached page, When it is shown, Then it loads through the custom protocol.
- Given a page protocol URL outside the page store, When requested, Then it is refused.
- Given two windows, When one changes data, Then the other updates without a reload.
- Given a packaged build on each platform, When installed and launched, Then it runs without a dev environment.
- Given a new release, When the app checks, Then it asks before installing and never interrupts a chapter.

## Open

Code signing and notarization need paid certificates and the owner's decision. Without them, Windows and
macOS show security warnings at install. Builds still work for private use.

## Out of scope

Serving other devices over the network. A paired helper for phones is reconsidered only after spec 10.
