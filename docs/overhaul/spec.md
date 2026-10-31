# App overhaul - spec

Supersedes the sequence in `docs/recovery/` where they conflict. `docs/SPEC.md` still lists the
product's features; this file sets priority and the rules for finishing them.

## Problem

A live audit (2026-10-31) found the app passes its suite but does not meet the product goal:

- Deployed web cannot reach MangaDex. Its API sends CORS headers only to `localhost` and its own
  site, and its documentation requires other sites to proxy API and image requests. Discover goes
  blank with no error when this fails.
- A page load with no server fails: no service worker, no manifest, and SSR that renders no data.
- Failures leak raw text, such as `["manga-detail-chapters",…] data is undefined`. Nothing tells
  users when work is saving, failed or retrying.
- Most E2E specs mock the network, so the suite cannot detect the problems above.
- The reader opens slowly (about 2.1s), page turns reach 708ms, webtoons are not detected, and its
  controls cover 20% of a phone screen on open.
- Layouts break on phones and tablets. The look is matte white, not playful liquid glass.
- 12 of 21 packages have a single consumer, and several add no depth.

## Decisions

| #   | Decision                                                                                                                                                                                                           | Why                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| D1  | Installable PWA first, designed for phones first. Electron second.                                                                                                                                                 | Most reading happens on phones; Electron keeps sharing the same code.                                                 |
| D2  | Web reaches MangaDex through a same-origin, allowlisted proxy for API and images. Electron and `localhost` dev call it directly.                                                                                   | Required by MangaDex's limits page. Two transports make this a real seam.                                             |
| D3  | Drop SSR; the web app is a client-rendered shell. A small server stays only for the proxy.                                                                                                                         | The database is browser-only, so SSR renders nothing useful and blocks offline start.                                 |
| D4  | Move browser SQLite to OPFS, with a one-time import from the IndexedDB snapshot.                                                                                                                                   | Whole-file snapshots get slower as data grows. Hard to reverse: needs its own ADR.                                    |
| D5  | Reader budgets: cached page turn under 50ms, controls hidden on open, webtoons detected automatically. Filmstrip deferred.                                                                                         | Measured gaps from the audit.                                                                                         |
| D6  | Rewrite `DESIGN.md` for playful, welcoming liquid glass: larger radii, one vivid accent, springy motion, glass on floating controls only, a calm reading stage. Three concept screens are approved before UI code. | Replaces "calm, deep", which conflicts with the goal.                                                                 |
| D7  | `useState` and `try/catch` are banned by lint, with a shrinking baseline. Local state uses a typed reducer hook in `@app/shared`, remote state TanStack Query, and shared client state Zustand.                    | The npm `use-state-reducer` is an abandoned 2022 v0.0.3. A baseline stops new violations while old ones are migrated. |
| D8  | Effect 4 for I/O modules: provider runtime, update queue, cache, database lifecycle. Not in gestures, rendering or the design system. Zod stays for schemas.                                                       | Those modules need retries, cancellation and typed errors; the others do not.                                         |
| D9  | Keep `shared`, `db`, `design-system` (with `motion`), `theme`, `platform`, `reader`, `extensions-sdk`, `extensions` (with core and MangaDex). Others move into the web app.                                        | Removes seams nothing varies across.                                                                                  |
| D10 | Theme editor, identity merge, diagnostics and bulk migration move under "Advanced". Data is untouched.                                                                                                             | Simplifies first use.                                                                                                 |
| D11 | One in-repo shadcn registry, vendored, license-checked and restyled to tokens. `tailwind-animations` for CSS motion; GSAP through `@app/motion` for choreography only.                                             | Mixed sources would look inconsistent; `@midudev/tailwind-animations` is deprecated.                                  |
| D12 | Telemetry is local-only: a bounded, redacted event log on the device, viewable and exportable from Diagnostics. Nothing leaves the device. A remote sink needs a later explicit opt-in design.                     | Fits a local-first reader, and provider and title data is private.                                                    |

## Failure and feedback model

Every failure is classified once into a typed `AppError` (`offline`, `provider-unavailable`,
`rate-limited`, `not-found`, `storage-full`, `database`, `unexpected`), carrying a user message, a
retry policy and redacted details. Raw error text is never rendered.

The severity of the failure picks the surface:

| Surface     | Used when                                   | Examples                                                       |
| ----------- | ------------------------------------------- | -------------------------------------------------------------- |
| Status page | Nothing useful can render on this route     | 404, crash, database failed, storage full, unsupported browser |
| Inline      | One section failed and the rest still works | Chapter list unavailable, with retry                           |
| Sonner      | A transient outcome of a user action        | Saved, Added to library, Could not save (retry)                |
| Silent log  | Background work the user did not ask for    | A background refresh failed while cached data is showing       |

Three middleware layers feed these surfaces, so features declare intent and do not handle errors:

1. Query and mutation cache: classifies errors, records telemetry, and shows toasts from a
   declarative `meta.feedback` on each mutation.
2. Router: status pages through default error, not-found and pending boundaries.
3. Proxy server: allowlist, redirect refusal, size and time limits, rate limits.

Toast rules: toasts come only through the design-system wrapper, are deduplicated by key, and sit
above the mobile nav. "Saving…" appears only when an action takes over 300ms. Reading never raises
a toast unless the reader itself cannot continue.

## Behavior

- Given a deployed web origin, When Discover loads, Then covers and titles arrive through the proxy.
- Given a proxy request for a host outside the allowlist, When it is sent, Then it is refused and no outbound request is made.
- Given provider failure, When Discover loads, Then an inline state with retry shows instead of a blank page.
- Given a title with no chapters, When its detail page loads, Then it says there are no chapters and shows no error.
- Given a query function with no result, When it runs, Then it returns a value and logs no "Query data cannot be undefined".
- Given a thrown error on a route, When it renders, Then a status page offers recovery and shows no raw text.
- Given a slow user save, When it passes 300ms, Then "Saving…" appears and resolves to saved or to a failure with retry.
- Given the same failure repeating, When toasts fire, Then one toast shows.
- Given any failure, When it is logged, Then Diagnostics lists it with tokens, query strings and credentials redacted.
- Given a 320px viewport, When any route renders, Then nothing overflows horizontally.
- Given a touch device, When any route renders, Then interactive targets measure at least 44px.
- Given a new `useState` or `try/catch` outside the baseline, When lint runs, Then it fails.
- Given the app was loaded once and the server is gone, When it is reloaded, Then the shell and library open.
- Given a downloaded chapter and no network, When it is opened, Then every page renders.
- Given a cached chapter, When a page is turned, Then the new page paints within 50ms.
- Given a chapter of long-strip pages, When it opens with no saved preference, Then it uses scroll mode at a bounded width.
- Given a chapter opens, When the first page shows, Then reader controls are hidden until the user taps.

## Known limit

MangaDex rate-limits by IP, about 5 requests per second and 40 At-Home calls per minute. Everyone
using one proxy shares that allowance, and persistent 429s lead to IP bans. The proxy suits a
personal or small deployment; it must enforce a global limit below these numbers and honor 429s.
A large public deployment would need a different provider strategy. Proxied images also bill their
bandwidth to the host.

## Not audited yet

Real iOS and Android devices, Electron, dark mode, and real pinch and swipe. Each is checked when
its wave ships.

## Out of scope

Remote telemetry, cloud sync, new providers, native mobile apps, the filmstrip.
