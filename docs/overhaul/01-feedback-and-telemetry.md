# 1. Feedback and telemetry - spec

## Problem

Users see raw errors such as `["manga-detail-chapters",…] data is undefined`, or a blank page. Three
queries return undefined: chapter hydration, reader chapter hydration, and the library update report.
Nothing reports saving, failure or retry, and failures leave no record.

## Decisions

| #   | Decision                                                                                       | Why                                            |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| F1  | Every failure is classified once into a typed `AppError` with a user message and retry policy. | One place decides what users see.              |
| F2  | Severity picks the surface, using the table below.                                             | Consistent behavior; toasts stay meaningful.   |
| F3  | Features declare intent with `meta.feedback`; middleware does the rest.                        | Features stop handling errors one by one.      |
| F4  | Sonner only through a design-system wrapper.                                                   | One toast API, deduplicated and styled once.   |
| F5  | The log is local, capped and redacted, with one shared redactor.                               | Useful for support while keeping data private. |

`AppError` kinds: `offline`, `provider-unavailable`, `rate-limited`, `not-found`, `storage-full`,
`database`, `unexpected`.

| Surface     | Used when                                   | Examples                                                       |
| ----------- | ------------------------------------------- | -------------------------------------------------------------- |
| Status page | Nothing useful can render on this route     | 404, crash, database failed, storage full, unsupported browser |
| Inline      | One section failed and the rest still works | Chapter list unavailable, with retry                           |
| Sonner      | A transient outcome of a user action        | Saved, Added to library, Could not save (retry)                |
| Silent log  | Background work the user did not ask for    | A refresh failed while cached data is showing                  |

Middleware layers: query and mutation cache (classify, log, toast); router (status pages through
error, not-found and pending boundaries); proxy server (spec 4).

Log events: `error`, `slow-provider-call`, `reader-timing`. Users can view, filter, clear and export
them in Diagnostics.

## Behavior

- Given a title with no chapters, When its detail page loads, Then it says there are no chapters and shows no error.
- Given any query function, When it finishes, Then it returns a value and logs no "Query data cannot be undefined".
- Given a route throws internal text, When it renders, Then a status page offers recovery and hides that text.
- Given an unknown URL, When it loads, Then a 404 page offers a way back to the library.
- Given provider failure, When Discover loads, Then an inline state with retry shows instead of a blank page.
- Given a save over 300ms, When it runs, Then "Saving…" shows and resolves to saved or to a failure with retry.
- Given a save under 300ms, When it succeeds, Then no Saving state flashes.
- Given the same failure repeats, When toasts fire, Then one toast shows.
- Given a background refresh fails over cached data, When it fails, Then no toast shows and the log records it.
- Given someone is reading, When background work fails, Then no toast shows unless the reader cannot continue.
- Given a phone and reduced motion, When a toast shows, Then it sits above the bottom nav and does not animate.
- Given more events than the cap, When recording, Then the oldest are dropped.
- Given an event with a token, URL query or credential, When stored or exported, Then those values are redacted.
- Given storage is unavailable, When recording, Then the app keeps working and the log falls back to memory.
- Given events are recorded, When the network is watched, Then no request is made.

## Out of scope

Remote telemetry or crash reporting. A separate public `/status` route: Diagnostics shows system state.
Final styling, which spec 7 handles.
