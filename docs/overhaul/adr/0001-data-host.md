# ADR 0001: the Electron data host

## Status

Proposed by the #209 spike; it takes effect when this ADR merges. Budgets stay provisional: the reference
machine is not confirmed and is pinned at packaging (#215).

Windows, Linux, packaged builds and the phone are not proven by this spike. See [Evidence](#evidence).

## Context

The renderer owns sql.js WASM and whole-file snapshots today. Spec 4 moves SQLite into one data process (X1)
and proposes keeping repositories synchronous behind typed RPC (X2) on `better-sqlite3` (X3), with TanStack DB
collections fed from the host (X12). This ADR had to prove or replace that on real code.

What the code looks like, measured at `1c23a37`:

- `AppDrizzleDb` is `SQLJsDatabase<AppSchema>`, and 8 SQL migrations ship in `packages/db/migrations`.
- `packages/db/src`: 26 non-test files mention the type; 143 `db: AppDrizzleDb` signatures across 22 files; 121
  exported functions take `db` first.
- Outside `packages/db`: 73 non-test files mention the type, with 241 lines passing `db`, and 60 dynamic
  `import('@app/db')` calls.
- Nothing outside `packages/db` calls `db.select` and friends or `withTransaction`. Every transaction already
  lives inside one repository function, so none has to span an RPC call.

## Decision

**1. Sync-in-host holds.** Repositories stay synchronous in an Electron utility process. The UI reaches them
over a MessagePort, so a slow query cannot block a window.

**2. The driver is `node:sqlite`, through a small adapter. `better-sqlite3` 13 is the tested exit.** This
changes X3. Both drivers passed every test here with the same results, so the choice rests on what each one
costs to ship:

| Fact                          | `node:sqlite` in Electron 44.7              | `better-sqlite3` 13.0.3                                   |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| Real suite (239 tests)        | 238 pass; the 1 failure tests sql.js itself | Same 238 and the same failure                             |
| Electron end to end           | All pass in a utility process               | All pass in a utility process                             |
| SQLite version                | 3.53.4                                      | 3.53.4                                                    |
| To ship                       | Nothing: it is inside Electron              | A native file per target, outside ASAR, signed in the app |
| Install and rebuild           | None                                        | 26 MB package, 16 MB of it 8 N-API prebuilds; no rebuild  |
| Drizzle 0.45.4                | Stock driver fails; 63-line adapter passes  | Stock driver                                              |
| API status                    | Release candidate (Node stability 1.2)      | Stable, long-lived library                                |
| First open in a fresh process | 0.13-0.15 ms                                | About 3.2 ms; 172 ms on the first load after install      |

X3's premise has moved. `better-sqlite3` 13 is N-API with prebuilds and no install script, so `@electron/rebuild`
builds nothing and the Electron-specific rebuild problem is gone. What remains is a native binary to place, unpack
and sign on three platforms while the code-signing decision is still open. `node:sqlite` removes that work, at the
price of a release-candidate API and an adapter we own. That price is small and caught by tests: the adapter uses
eight `node:sqlite` members, and an Electron bump is already a deliberate event.

Switching later means changing one function (`openClient`) and adding one dependency. Move to `better-sqlite3` if
a future Electron breaks that surface, if `node:sqlite` turns out absent or different on Windows or Linux, or if a
needed SQLite build option is missing. The compile options differ today: `better-sqlite3` adds `ENABLE_STAT4` and
`ENABLE_FTS4`; `node:sqlite` adds `ENABLE_SESSION` and `ENABLE_PREUPDATE_HOOK`. FTS5 and JSON work on both.

**3. `AppDrizzleDb` becomes one alias.**

```ts
export type AppDrizzleDb = BaseSQLiteDatabase<"sync", unknown, AppSchema>;
```

A union fails (132 errors in 17 files) because Drizzle's overloads do not survive it. A minimal `Pick` interface
also compiles, but restricts nothing the repositories need restricted and is more to maintain.

**4. The UI calls a generated client with the same names.** `listLibraryEntries(db)` keeps its name and call
shape. `db` becomes a host handle, and each generated function posts the call to the host. The host keeps the real
repositories behind a separate entry point. Apart from `withTransaction`, which stays in the host, no `db`-first
export is generic or takes a callback or an `AbortSignal`.

**5. One host, one queue.** Calls run strictly in order, so an async repository cannot interleave with another
at its `await` points. Main hands each window a MessagePort, so only frames main created can reach the host (X6).
Every call is validated with Zod before it runs.

**6. Collections sync through a custom adapter (X12).** Temp triggers on synced tables record each committed row
change; they roll back with the transaction and also see FK cascades. After each call the host sends the changes
to every window, then replies. A mutation handler awaits the reply and the refetch of its rows, so the synced row
replaces the optimistic one without a flicker. `AppResult` errors are thrown, which rolls the write back.

Large tables use `syncMode: 'on-demand'`, and the host refuses an unbounded chapter load.

## Consequences

- The host must set its PRAGMAs explicitly: `journal_mode`, `foreign_keys` and `synchronous`. Defaults differ by
  driver: under WAL, `node:sqlite` defaults to `synchronous=FULL` and `better-sqlite3` to `NORMAL`.
- The adapter imports `drizzle-orm/better-sqlite3/session`, a public export, without loading `better-sqlite3` at
  compile or run time (proven by removing the package). A Drizzle bump reruns the suite; Drizzle's future
  `node:sqlite` driver, if one ships, can replace the adapter.
- `withTransaction` gets stricter. A callback returning a promise now throws and rolls back, where sql.js would
  commit. No repository does this: the suite passes.
- Optimistic inserts need ids from the client. `addLibraryEntry` accepts one, but 14 `newId()` calls generate ids
  inside repositories. Each one a collection inserts through needs an optional `id`, added as it is converted.
- No repository pages chapters, and `listChaptersForManga` also loads the pages of each chapter. On-demand loading
  needs a new procedure; the spike's `listChapterWindow` is the shape.
- Change capture costs writes: 20,000 inserts took about 200 ms with triggers and 135 ms without, measured on this
  Mac. Tables that no collection reads get no triggers. Tables without a single-column key need `rowid`.
- Multi-call features were never atomic and stay that way, but other windows' calls can now land between their
  calls. 22 files make two or more write calls. Those that must be atomic, such as `persistMangaDetailToDb`, become
  one host procedure.
- `AppError.cause` crosses by structured clone and loses any class. `classifyAppError` must not depend on it.
- The library is over budget before any of this. See [Budgets](#budgets).

## Alternatives

| Alternative                        | Why not                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `better-sqlite3` as the default    | Works equally well, but adds per-platform packaging with no measured benefit. The exit. |
| Async repositories                 | Needless: the sync shape held. It would rewrite `withTransaction` and every repository. |
| sql.js in the host                 | Keeps whole-file snapshots and a full export for durability, which X1 exists to remove. |
| Hand-written IPC per feature       | 121 channels to keep in step by hand, for no gain over generating them.                 |
| TanStack Query only, no sync layer | Sync-in-host held, so the fallback is not needed. It also lacks live multi-window rows. |

## Evidence

Run on one Mac (Mac16,1, 10 cores, 32 GB, macOS 27.2, arm64), which is not the reference machine. Runtime: Electron
44.7.0, Node 24.21.0, ABI 149. Commands are in [the spike README](0001-spike/README.md); `run-all.sh` writes every
file under `0001-spike/evidence/`.

| Checklist item                                       | State      | Evidence file          | Result                                                                                                  |
| ---------------------------------------------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Driver-neutral `AppDrizzleDb`                        | Proven     | `09`, `10` step A      | Alias: 0 errors. The whole workspace typechecks (19 of 19 turbo tasks) with only `adapter.ts` changed.  |
| Migrations on the driver                             | Proven     | `04`                   | 8 real migrations on both, in 4-8 ms; a rerun applies nothing.                                          |
| `withTransaction` and rollback                       | Proven     | `04`, `07`             | Commit, forced rollback, FK failure, nested savepoint and async refusal pass on both.                   |
| Real repository suite on the driver                  | Proven     | `07`                   | 238 of 239 on both. The failure calls the sql.js migrator on a native handle (`stmt.free`).             |
| Representative read                                  | Proven     | `11`, `12`             | `listLibraryEntries(db)` over a port, source unchanged.                                                 |
| Representative write with transaction rollback       | Proven     | `11`, `12`             | `reorderLibraryCategories` commits; a failure mid-transaction rejects and restores the earlier row.     |
| One feature module                                   | Proven     | `11`                   | `@app/extensions` core and fetchers: 124 real tests plus 2 new pass over a port, with no source change. |
| Values survive the boundary                          | Proven     | `08`                   | 238 of 239 through `structuredClone`. Breaking the boundary fails 59 tests, so it was on the path.      |
| Remaining-file estimate                              | Proven     | `10` step B            | Below. Measured by compiling the workspace against the client.                                          |
| List collection from the host                        | Proven     | `12`                   | Real `@tanstack/db` `1.0.0-rc.1.1` in a sandboxed renderer, fed by a utility process.                   |
| Optimistic write survives acceptance                 | Proven     | `12`                   | Visible at once, `completed`, no flicker, stored in SQLite.                                             |
| Optimistic write rolls back on rejection             | Proven     | `12`                   | Update and insert both roll back with a typed error; SQLite is unchanged.                               |
| On-demand large table                                | Proven     | `12`                   | 50, then 100, of 200,000 chapters in memory; first window about 7 ms.                                   |
| Two windows stay current                             | Proven     | `12`                   | Window B sees window A's committed rows, and none of its rejected ones, without a reload.               |
| Renderer never blocked                               | Proven     | `12`                   | Longest timer gap 12 ms while the host was held for 1.5 s.                                              |
| `better-sqlite3` versus `node:sqlite`: rebuild facts | Proven     | `02`, `03`, `05`, `06` | Darwin arm64 only for loading. Prebuilds for 8 targets exist, and were not run on the other 7.          |
| Same contract in a browser Worker                    | Proven     | `13`                   | The same scenario passes in a real Web Worker on sql.js. Shape only: see below.                         |
| `node:sqlite` on Windows and Linux                   | Not proven | None                   | No such machine here. Check first in #215; failure triggers the exit in decision 2.                     |
| Packaging: ASAR, signing, installers                 | Not proven | None                   | #215's scope.                                                                                           |
| Host crash and reconnect                             | Not proven | None                   | The kill test proves the file survives; window reconnection is not built. Next implementation issue.    |
| `@tanstack/react-db` bindings                        | Not proven | None                   | Only the core library ran. The first feature conversion must exercise them.                             |

Also measured: `kill -9` mid-write leaves `integrity_check` ok with whole batches only, on both drivers (`05`). A
snapshot built by the renderer's own migrator opens natively with counts matching and migrations 8 to 8, on both
(`05`), which is the core of X10. No snapshot from a real user's app was tried.

### Worker fit (spec 10)

The contract fits unchanged. `serveHost`, `createHostClient`, the change capture, the sync adapter and the scenario
all ran with a Web Worker in place of the utility process and a `Worker` in place of the port. Only the opener
differs.

What would change later: the storage engine and its OPFS persistence, one owning tab (W8) with some way for other
tabs to reach it, and main's sender check, which has no browser equivalent. None of that is proven here. The run used
in-memory sql.js in Electron's Chromium, not a real browser or a phone. W8 still needs its own ADR and phone test.

## Migration and conversion plan

Measured by making `@app/db` the generated client in a throwaway clone and compiling everything (`10`).

| Step                              | Files                                               | How it was sized                                                  |
| --------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Type alias                        | 1 (`adapter.ts`)                                    | Workspace passes with this alone                                  |
| Host opener, adapter, migrator    | About 3 new                                         | Spike: 63-line adapter, about 20-line opener                      |
| RPC and generated client          | About 3 new, 121 procedures generated               | Spike: 97-line RPC; generator emits all 121                       |
| Zod schema per procedure          | 121 schemas                                         | Spike wrote 13. Hand work, partly reusing `@app/shared`           |
| Features calling repositories     | 0 source edits to compile, of 73                    | Only `local-db.ts` fails among production files                   |
| `local-db.ts` and its provider    | 2 rewritten                                         | The 2 production errors; the session and flush API go away        |
| Test files                        | 35 fail to compile, 896 errors; fixed mostly by 1   | They pass a real `db` to the client; the harness returns a handle |
| Features needing atomicity        | Review 22                                           | Files with 2 or more write calls                                  |
| Collections and mutation handlers | Per surface: 53 query and 46 mutation sites         | Counted, not converted; adapter is 135 lines                      |
| Retired after import (X10)        | `persistent-database`, `merge-uncommitted-progress` | Renderer session only                                             |

Compiling is not the whole conversion. It shows the call shape holds, not that each flow behaves correctly over a
port. The 126 converted tests cover `@app/extensions` and two representative callers; the other features are
covered by types only until they run.

Order: the alias first, since it is harmless alone; then host, client and the import; then features move as the
renderer's sql.js session retires; collections replace queries surface by surface.

## Budgets

Provisional. The reference machine (the slowest laptop the owner can test on) is not confirmed and is pinned at
packaging (#215). These numbers come from a fast Mac, so they show only the floor.

| Measure                             | Budget | Measured here on the seeded dataset                                                                       |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Launch to usable library            | 1.5s   | Not measured: no real app shell. Reopen plus first read is about 1 ms; the list is below.                 |
| Library: open and filter            | 100ms  | **Over:** full list 340 ms over RPC, 300-340 ms in-process, 480 ms on today's sql.js. Filter is 45-50 ms. |
| Renderer blocked by a database call | Never  | Longest timer gap 12 ms during a 1.5 s host stall                                                         |

`listLibraryEntries` costs 300 ms or more on every driver, so this cost is in the repository or its data, not the
driver. It has not been profiled. Moving to the host removes the jank but not the wait, so a paged or narrower
library query must land before the budget can be met.

## Open questions

- The owner confirms the reference laptop and budgets. Blocks only #215's final numbers.
- `node:sqlite` on Windows and Linux, checked first thing in #215.
- Code signing, which only `better-sqlite3` would add native-binary work to.
- Whether `listLibraryEntries` is fixed before or with the library's collection.
- TanStack DB is pinned to a release candidate. The adapter uses `begin`, `write`, `commit`, `markReady`, `fail` and
  `loadSubset`. A bump reruns the Electron probe.
