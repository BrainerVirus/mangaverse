# 5. Local data and offline - spec

## Problem

With no server, a page load fails. Downloads do not exist. SQLite runs on the main thread, so a slow
query can freeze scrolling. `listLibraryEntries` loads every row and filters in JavaScript. Page-save
failures are silently ignored, so a full disk looks like a cache miss. Persistent storage is requested
only on the Storage page.

## Decisions

| #   | Decision                                                                                      | Why                                                       |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| O1  | Query speed first, on the current database: paged SQL, indexes, query-time tests.             | The largest quick win, and it needs no migration.         |
| O2  | Local data renders first; the network refreshes it in the background.                         | Creates the local feel online.                            |
| O3  | Fetched data is reused: chapter lists until stale, cached pages never fetched again.          | Avoids refetching, and lowers rate-limit pressure.        |
| O4  | Precomputed read rows per library title, updated as data changes.                             | Large libraries open without heavy joins.                 |
| O5  | Save first, then do network work from a resumable queue.                                      | Progress is never lost to a slow network.                 |
| O6  | SQLite in a Worker on OPFS with one owning tab; other tabs send it queries.                   | Keeps the UI responsive and removes snapshot merging.     |
| O7  | O6 waits for a phone test and an ADR.                                                         | Hard to reverse, and evidence includes a vendor blog.     |
| O8  | Client-rendered shell with a service worker. Updates ask first.                               | Offline start, with no reader swapped mid-chapter.        |
| O9  | Pages stored as one file each in OPFS, indexed in SQLite.                                     | Handles large libraries better than blobs in IndexedDB.   |
| O10 | Downloads run while the app is open and resume on launch.                                     | iOS has no background download APIs.                      |
| O11 | Request persistent storage at startup. Users set a storage limit, with LRU for non-downloads. | Reduces eviction. Downloads are never evicted by the app. |

### Phone test for O7

Compare `@journeyapps/wa-sqlite` with official `@sqlite.org/sqlite-wasm` on a real iPhone and Android
phone: startup, query and write times on a large library, multiple tabs, killing the app mid-write,
private browsing, and import from the current snapshot. Also confirm the wa-sqlite license, which npm
did not show, and that Drizzle works through its proxy driver. If neither passes, keep sql.js and move
it into a Worker.

The migration is one-way for users, so it keeps a backup of the old snapshot until the import is verified.

### Provisional budgets

Confirm these on a real mid-range phone during implementation.

| Measure                                    | Budget |
| ------------------------------------------ | ------ |
| Installed app reopened to a usable library | 1s     |
| Library of 1,000 titles: open and filter   | 100ms  |
| Interaction blocked by a database call     | Never  |

## Behavior

- Given the app loaded once and the server is gone, When it reloads, Then the shell and library open.
- Given a downloaded chapter and no network, When it opens, Then every page renders.
- Given a cached title online, When its page opens, Then local data shows at once and refreshes in place.
- Given a cached page, When it is shown again, Then no request is made.
- Given the user taps download, When the app closes partway, Then the next launch resumes from the last finished page.
- Given a full disk, When a page save fails, Then the user is told and offered storage management.
- Given a downloaded chapter under storage pressure, When the app evicts, Then downloads are kept and cached pages go first.
- Given two tabs, When one changes data, Then the other sees it without a reload.
- Given the owning tab closes, When another tab is open, Then it takes over with no data loss.
- Given the app is killed mid-write, When it reopens, Then the database is intact.
- Given a new version while offline or reading, When it is ready, Then the app asks first and never swaps mid-chapter.
- Given an iPhone in Safari, When the app is not installed, Then it explains the storage risk and how to install.
- Given the old snapshot exists, When the new database first opens, Then data migrates exactly once and is verified.
- Given a large library, When key queries run in tests, Then they stay inside their budgets.

## Decide after testing

TanStack DB, currently a release candidate, for live queries. Adopt only if plain Query plus Worker
results fall short of the budgets.

## Out of scope

An event log like T3 Code's, cloud sync, and background downloads on iOS.
