# App overhaul - spec

Status: draft for review. Nothing here is approved for implementation until the owner says so.

This is the umbrella spec. It wins over `docs/recovery/` where they conflict. `docs/SPEC.md` still
lists the product's features; these files set priority and the rules for finishing them.

| Order | Spec                                                   | Covers                                          |
| ----- | ------------------------------------------------------ | ----------------------------------------------- |
| 1     | [Feedback and telemetry](01-feedback-and-telemetry.md) | Status pages, Sonner, middleware, local log     |
| 2     | [Layout](02-layout.md)                                 | Responsive fixes on current screens             |
| 3     | [Engineering rules](03-engineering-rules.md)           | State and error bans, Effect, deslop, packages  |
| 4     | [Providers and network](04-providers-and-network.md)   | Transports, proxy, recipes, helper              |
| 5     | [Local data and offline](05-local-data-and-offline.md) | Database, speed, offline shell, downloads       |
| 6     | [Reader](06-reader.md)                                 | Reader engine and settings                      |
| 7     | [Design](07-design.md)                                 | Playful liquid glass and the component registry |

## Problem

A live audit (2026-10-31) found the app passes its suite but misses the product goal:

- Deployed web cannot reach MangaDex. Discover goes blank with no error when this fails.
- A page load with no server fails: no service worker, no manifest, and SSR that renders no data.
- Downloads do not exist. Third-party providers cannot run; installing one only stores its manifest.
- Failures leak raw text, and nothing tells users when work is saving, failed or retrying.
- Most E2E specs mock the network, so the suite cannot detect these problems.
- The reader opens slowly (about 2.1s), page turns reach 708ms, and webtoons are not detected.
- Layouts break on phones and tablets. The look is matte white, not playful liquid glass.
- 12 of 21 packages have one consumer, and several add no depth.

## Product position

MangaVerse is web first: the website, installable as a PWA, is the main product on every device.
Electron is the only other app. There will never be a native mobile app.

Content comes from provider extensions, using an official free API where one exists and scraping
otherwise. The host stores no pages, and requests come from the user's own IP wherever the platform
allows it. The app feels local because it reads local data first and avoids refetching.

## Decisions

| #   | Decision                                                                                               | Why                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| D1  | Web first, designed for phones first. Electron is the only other app. No native mobile, ever.          | Owner decision.                                                                       |
| D2  | One transport layer trying direct, extension, helper, then hosted proxy.                               | No single route works everywhere. See spec 4.                                         |
| D3  | Hosted proxy serves official-API providers only, capped. Scraping needs an extension or helper.        | Avoids scraping at scale from one server and sharing one rate limit.                  |
| D4  | No hosted page storage and no shared page cache.                                                       | Hosting copies makes the host a distributor. Free tiers are also far too small.       |
| D5  | Recipe providers first: data, not code. Sandboxed code providers come later.                           | The app runs on one origin, so running remote code is the highest risk.               |
| D6  | No iPhone App Store wrapper for now.                                                                   | Close to the native app ruled out by D1, and store review is uncertain.               |
| D7  | Electron doubles as a personal helper, later joined by a headless version, after the web flow works.   | The only route giving a phone the user's own IP on any browser.                       |
| D8  | Drop SSR. The web app is a client-rendered shell; a small server stays only for the proxy.             | The database is browser-only, so SSR renders nothing useful and blocks offline start. |
| D9  | SQLite moves to a Worker on OPFS with one owning tab, subject to a real-phone test and an ADR.         | Keeps the UI from freezing and removes snapshot merging. Hard to reverse.             |
| D10 | `useState` and `try/catch` banned by lint with a shrinking baseline, replaced by a local reducer hook. | The npm `use-state-reducer` is an abandoned 2022 v0.0.3.                              |
| D11 | Effect 4 for I/O modules only. Zod stays for schemas. TanStack stays for routing and queries.          | I/O needs retries, cancellation and typed errors; rendering and gestures do not.      |
| D12 | Consolidate to about 8 packages. Advanced features move under an "Advanced" section.                   | Removes seams nothing varies across and simplifies first use.                         |
| D13 | Telemetry is local-only and redacted. Nothing leaves the device.                                       | Fits a local-first reader; reading data is private.                                   |
| D14 | Reader has three levels: defaults, quick panel, advanced.                                              | Great with no setup, with every detail tunable for those who want it.                 |
| D15 | Rewrite `DESIGN.md` for playful, welcoming liquid glass. Concept screens are approved before UI code.  | Replaces "calm, deep", which conflicts with the goal.                                 |

## Limits the product must state plainly

- iPhone: without adding to the Home Screen, storage can be wiped after 7 days of Safari use without
  visiting the site. Downloads pause when the app closes. Fullscreen is iPad-only.
- No browser guarantees storage. Large libraries are possible, not promised, so export matters.
- A phone with no helper or extension gets official-API providers only.
- MangaDex limits about 5 requests per second per IP and 40 At-Home calls per minute. Everyone on the
  hosted proxy shares that, so a large public deployment would need a different provider strategy.
- Running on the user's device reduces copyright exposure but does not remove it. Get legal advice
  before a public launch. The core app bundles no scrapers, and any registry stays separate.

## Not audited yet

Real iOS and Android devices, Electron, dark mode, and real pinch and swipe. Each is checked when
its spec ships.

## Out of scope

Native mobile apps, hosted pages, defeating anti-bot systems or rate limits, spoofed identities,
rotating IPs, remote telemetry, cloud sync.
