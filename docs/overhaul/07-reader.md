# 7. Reader - spec

## Problem

Measured: opening a chapter takes about 2.1s and page turns take 15-708ms. Controls start visible and
cover 168px of an 844px phone screen. A long-strip chapter opened in Single mode, and on desktop its
pages stretch to 1440px. The decode queue is dead code, zoom runs through React state, and scroll mode
keeps every row in the DOM.

## Decisions

| #   | Decision                                                                                | Why                                                        |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1  | One deep reader interface: source, settings and progress in; everything else behind it. | Reader fixes stop spreading across packages.               |
| R2  | Loading order: current page, neighbors, then ahead; stale loads cancelled on each turn. | Follows Mihon's loader, and speeds the page being read.    |
| R3  | Decode ahead in a small bounded pool and release what leaves the window.                | Page turns stop waiting on decode; memory stays bounded.   |
| R4  | Virtualize long strips; tile very tall pages when tests show browser limits are hit.    | Keeps long chapters stable on phones.                      |
| R5  | Gestures and zoom run outside React state.                                              | Stays smooth regardless of app rerenders.                  |
| R6  | Auto mode resolves: title override, provider metadata, page shape, then global default. | Tags are unreliable; page shape catches mislabeled titles. |
| R7  | Quick-panel changes apply to this title by default, with a visible "All titles" choice. | Follows Paperback, and replaces a hidden toggle.           |
| R8  | Controls hidden on open. A tap shows them.                                              | Reading gets the whole screen.                             |

### Budgets

| Measure                                | Budget                                        |
| -------------------------------------- | --------------------------------------------- |
| Cached page turn to paint              | 50ms                                          |
| Open a cached chapter to first page    | 300ms (provisional)                           |
| Open an uncached chapter to first page | Show progress; report timing to the local log |

### Settings

Defaults change from today: mode and layout become Auto, paged fit becomes fit-to-screen, the page
transition becomes none, and preload goes from 2 ahead to 4 ahead and 1 behind.

| Level    | Setting                                                           | Default                                            |
| -------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Quick    | Mode: Auto, RTL, LTR, Strip                                       | Auto                                               |
| Quick    | Layout: Auto, Single, Double                                      | Auto: spreads in landscape, single in portrait     |
| Quick    | Fit                                                               | Screen when paged, width in strips                 |
| Quick    | Strip gap                                                         | 0                                                  |
| Quick    | Background                                                        | Black                                              |
| Quick    | Applies to: this title or all titles                              | This title                                         |
| Reader   | Tap zones, invert                                                 | Left and right                                     |
| Reader   | Spread offset, per title                                          | Cover alone                                        |
| Reader   | Wide pages: isolate or split                                      | Isolate in double mode                             |
| Reader   | Max strip width                                                   | 100% on phones, about 70% on desktop (provisional) |
| Reader   | Page number, chapter transition screen                            | On                                                 |
| Reader   | Transition, wheel, keep awake, fullscreen, shortcuts              | None, scroll, on, off, standard                    |
| Advanced | Preload ahead, preload behind                                     | 4, 1, counted in pages                             |
| Advanced | Next-chapter threshold                                            | 25% read                                           |
| Advanced | Data saver                                                        | Off; manual, since metered detection is unverified |
| Advanced | Prefetch budget                                                   | 250 MB, offered as presets                         |
| Advanced | Display downscale, labeled as saving memory and not data          | Auto                                               |
| Advanced | Tall-page tiling threshold                                        | Auto                                               |
| Advanced | Low memory, smoothing, gesture, pinch, double-tap and zoom limits | Current values                                     |
| Advanced | Diagnostics, tap-zone overlay                                     | Off                                                |

### Delivery

- First release: everything above, including Auto mode, scope, spread offset, wide pages and max strip width.
- Next: crop borders (off by default, since it can cut the center fold), auto-scroll, color filters.
- Later: scanlator preferences, quick-panel customizing, upscaling, panel view.

### Bugs to fix

- The brightness slider appears to affect nothing. Remove it until color filters ship.
- The in-reader sheet omits `smartSpread` and `lShaped`.
- Choosing a layout in vertical mode forces LTR, losing RTL direction. Reproduce first.
- Saved values exceed the UI: strip gap 2000 versus 64, preload 20 versus 10.
- `lowMemoryMode` appears on two settings pages. Keep one.
- `rememberPerTitleOverrides` is replaced by R7.

## Behavior

- Given a cached chapter, When a page is turned, Then the new page paints within 50ms.
- Given rapid page turns, When they happen, Then stale loads are cancelled and the final page shows.
- Given a chapter opens, When the first page shows, Then controls stay hidden until a tap.
- Given a long-strip chapter with no saved preference, When it opens, Then it uses Strip at a bounded width.
- Given a mislabeled long-strip chapter, When page shapes disagree with metadata, Then page shape decides.
- Given a title override, When the chapter opens, Then the override wins over everything else.
- Given a change in the quick panel, When it is made with default scope, Then only this title changes.
- Given zoom, pan or pinch, When they run, Then the app shell does not rerender.
- Given a very long strip on a phone, When scrolled end to end, Then mounted pages stay bounded and the tab survives.
- Given a killed tab, When the reader reopens, Then it resumes from the latest position.
- Given a double-page layout with a credits page, When spreads misalign, Then spread offset fixes this title.
- Given reduced motion, When controls or pages change, Then nothing animates.

## Not verified

Webtoon's and Manga Plus's settings, Paperback's preload defaults, browser limits for tall pages, and
metered-connection detection. Test these on real devices before relying on them.

## Out of scope

Filmstrip for the first release, and decorative motion while reading.
