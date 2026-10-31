# 6. Local data and downloads - spec

## Problem

`listLibraryEntries` loads every row and filters in JavaScript, with no indexes on its filters. Overview
recomputes chapter stats per entry. Downloads do not exist: "downloaded" only means pages happened to be
cached. Page-save failures are silently ignored, so a full disk looks like a cache miss.

These rules apply to every platform. Electron ships them first; web limits are in spec 10.

## Decisions

| #   | Decision                                                                             | Why                                                      |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| O1  | Query speed first: paged SQL, indexes matched to filters, and query-time tests.      | The largest quick win, and it needs no storage change.   |
| O2  | Local data renders first; the network refreshes it in the background.                | Creates the local feel online.                           |
| O3  | Fetched data is reused: chapter lists until stale, cached pages never fetched again. | Avoids refetching and lowers rate-limit pressure.        |
| O4  | Precomputed read rows per library title, updated as data changes, if O1 falls short. | Large libraries open without heavy joins. Measure first. |
| O5  | Save first, then do network work from a resumable queue.                             | Progress is never lost to a slow network.                |
| O6  | Explicit downloads, separate from the cache and never evicted automatically.         | Offline reading must be something users can rely on.     |
| O7  | Users set a cache limit; non-downloaded pages leave first, least recently used.      | Disk use stays predictable.                              |
| O8  | Downloads resume per page after a restart and respect provider rate limits.          | Failed pages retry without restarting the chapter.       |

### Query budgets

Dataset: seeded 1,000 titles and 200,000 chapters. In CI, a test records query plans and fails on a table
scan of a key query. Timing budgets from spec 4 are measured on the reference machine at each milestone end.

## Behavior

- Given a downloaded chapter and no network, When it opens, Then every page renders.
- Given a cached title online, When its page opens, Then local data shows at once and refreshes in place.
- Given a cached page, When it is shown again, Then no request is made.
- Given a download interrupted by closing the app, When it reopens, Then it resumes from the last finished page.
- Given a page that keeps failing, When retries run out, Then that page is marked and the rest of the chapter is kept.
- Given a full disk, When a page save fails, Then the user is told and offered storage management.
- Given the cache limit is reached, When eviction runs, Then downloads are kept and the oldest cached pages leave first.
- Given a removed download, When removal finishes, Then disk use and the UI agree.
- Given the seeded dataset, When key queries run in tests, Then their plans use indexes and they page results.
- Given a user adds a title, When saved, Then it appears immediately even if the network fails.

## Decide after testing

Live queries through TanStack DB, currently a release candidate. Adopt only if Query plus the data host
falls short of the budgets.

## Out of scope

An event log like T3 Code's, and storing pages on any server.
