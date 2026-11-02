# 4. Electron runtime - spec

## Problem

Electron loads the web router unchanged. In production it forks the Nitro server and loads a loopback
URL. SQLite is sql.js in the renderer, with whole-file snapshots in browser storage, and window updates
rely on a `localStorage` ping. Provider JSON is fetched from the renderer under a security policy that
hard-codes MangaDex, while only image bytes cross IPC. Page blobs live in IndexedDB. The local Express
service exposes only health and diagnostics. It builds today, but has no packaging or auto-update
dependency.

## Decisions

| #   | Decision                                                                                                                                                        | Why                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| X1  | One data process: an Electron utility process owns native SQLite and runs the repositories.                                                                     | The UI never blocks on the database, and a crash there cannot take the window down.        |
| X2  | Proposed, pending ADR 0001: repositories stay synchronous inside the data host, and the UI calls them over typed RPC.                                           | Would keep `withTransaction` and most queries, but caller conversion is real work.         |
| X3  | Proposed, pending ADR 0001: native SQLite through `better-sqlite3`.                                                                                             | Drizzle 0.45 has a sync driver for it. Type compatibility is not yet proven.               |
| X4  | The main process makes all provider requests. The renderer has no direct network access to providers.                                                           | Enforces limits in one place, with no CORS and the user's own IP.                          |
| X5  | Pages are files on disk, served to the UI by a restricted custom protocol.                                                                                      | Streams images with no blob copies over IPC.                                               |
| X6  | IPC is the app's backend boundary, validated with Zod. Keep the Express service only if a real need appears.                                                    | Deletion test: nothing uses its HTTP today, and IPC needs no open port.                    |
| X7  | Downloads and update checks run in the background while the app is open or in the tray.                                                                         | Desktop has no iOS-style limits.                                                           |
| X8  | Package for Windows, macOS and Linux with auto-update from GitHub Releases.                                                                                     | An app nobody can install is not the product.                                              |
| X9  | Renderer stays sandboxed with context isolation, a strict security policy, and no Node access.                                                                  | Providers and web content are untrusted.                                                   |
| X10 | Existing snapshots import once into native SQLite. The old data stays until the import is verified.                                                             | Protects data on a one-way move.                                                           |
| X11 | Replace the forked Nitro server with a client-rendered shell served from a custom protocol.                                                                     | Delivers D8 for Electron: no loopback port and offline start. Needs routing and CSP tests. |
| X12 | TanStack DB collections read from the data host through a custom sync adapter. The host sends change events to every window, replacing the `localStorage` ping. | Live, optimistic UI in every window, with SQLite still the source of truth.                |
| X13 | The main process owns page files and the cache index, replacing IndexedDB and renderer object URLs.                                                             | One owner for files, eviction and cleanup.                                                 |

### ADR 0001: data host

Decide before building, with a spike that must prove all of this on real code:

- A driver-neutral `AppDrizzleDb` type. Today it is `SQLJsDatabase`, and migrations use the sql.js driver.
- Migrations and `withTransaction` running on the chosen driver, including rollback.
- End-to-end conversion of representative callers: one read, one write with a transaction, and one
  feature module. Today callers pass a `db` handle to imported functions, so the likely shape is a
  generated typed client with the same names, running each call in the data host.
- An estimate of the remaining files, from that conversion.
- The TanStack DB sync adapter: one list view and one optimistic write working end to end, including rollback
  when the host rejects a write, and on-demand loading of large tables such as chapters.
- `better-sqlite3` versus `node:sqlite` under Electron 44: native rebuilds per platform, and driver support.
- Whether the same RPC contract fits a browser Worker later (spec 10).

If sync-in-host does not hold, the ADR proposes an alternative before milestone 2 continues.

### Security requirements

- **IPC:** validate every message with Zod and authorize the sender. Only the app's own frame on the app's
  own protocol can call privileged channels.
- **Network:** resolve hosts and refuse private, loopback and link-local addresses at connection time, closing
  the DNS rebinding race noted in the current main-process fetch. Revalidate domains and addresses on every
  redirect. Bound response size and time.
- **Page protocol:** URLs carry page store IDs, never file paths. Canonicalize resolved paths, refuse symlinks
  and anything outside the store, and serve only the app's frames.

### Migrating renderer data

| Data                              | Handling                                                  |
| --------------------------------- | --------------------------------------------------------- |
| SQLite snapshot                   | Import once and verify counts; old copy kept              |
| User-created blobs, custom covers | Move to files and verify; never discard                   |
| Cached pages and covers           | Move when practical; may be discarded, since they refetch |
| Pointers to moved data            | Rewritten in the same import                              |

### Budgets

Provisional until measured. Reference machine: the slowest laptop the owner can test on, recorded in the ADR.
Dataset: seeded 1,000 titles and 200,000 chapters.

| Measure                             | Budget |
| ----------------------------------- | ------ |
| Launch to usable library            | 1.5s   |
| Library: open and filter            | 100ms  |
| Renderer blocked by a database call | Never  |

## Behavior

- Given a fresh install, When the app opens with no network or account, Then onboarding and the library work.
- Given a packaged app, When it starts with no network, Then it loads from the custom protocol, deep routes resolve, and no loopback port is opened.
- Given no account, When a provider is used, Then requests go directly from the main process.
- Given a request outside the provider's declared domains, When sent, Then the main process refuses it and logs it.
- Given a domain resolving to a private address, When requested, Then it is refused, including after a redirect.
- Given the renderer tries to reach a provider directly, When it does, Then the security policy blocks it.
- Given a malformed IPC message or an unauthorized sender, When received, Then it is rejected with a typed error.
- Given a slow query, When it runs, Then the UI keeps responding.
- Given the data process crashes, When it restarts, Then windows reconnect, show what happened, and no committed data is lost.
- Given the app is killed mid-write, When it reopens, Then the database is intact.
- Given an existing sql.js snapshot, When the new version first opens, Then data imports exactly once and counts are verified.
- Given existing custom covers, When the import finishes, Then they still display.
- Given a failed import, When it happens, Then the old data is untouched and the app explains how to retry or export it.
- Given a cached page, When it is shown, Then it loads through the custom protocol.
- Given a page URL outside the store, a symlink, or a request from another frame, When requested, Then it is refused.
- Given two windows, When one changes data, Then live queries in the other update without a reload.
- Given an optimistic write the data host rejects, When it fails, Then the UI rolls back and reports it.
- Given a packaged build on each platform, When installed and launched, Then it runs without a dev environment.
- Given a new release, When the app checks, Then it asks before installing and never interrupts a chapter.

## Open

Code signing and notarization need paid certificates and the owner's decision. Without them, Windows and
macOS show security warnings at install. Builds still work for private use.

## Out of scope

Serving other devices over the network. A paired helper for phones was rejected.
