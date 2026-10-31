# 2. Layout - spec

## Problem

The audit measured the "More" tab running to 334px on a 320px screen and touch targets of 36-40px. The
manga detail page gives "Back" its own grid column, wasting about 29% of a phone's width and leaving
an empty grey box under the desktop cover. Card titles overlap cover art. Raw `unknown` and `mangadex`
labels show. All 138 chapter rows render at once.

## Decisions

| #   | Decision                                                    | Why                                                   |
| --- | ----------------------------------------------------------- | ----------------------------------------------------- |
| L1  | Structural fixes only. The look changes in spec 7.          | Working layouts make the redesign safer.              |
| L2  | Larger targets on coarse pointers only.                     | Desktop stays dense; touch stays comfortable.         |
| L3  | Virtualize the chapter list with `@tanstack/react-virtual`. | Already used for the library grid; no new dependency. |

## Behavior

- Given any primary route at 320, 390, 768 and 1440px, When rendered, Then nothing overflows horizontally.
- Given a touch device, When any primary route renders, Then interactive targets measure at least 44px.
- Given a fine pointer at 1440px, When a route renders, Then existing dense control sizes remain.
- Given the detail page at 390px, When rendered, Then the title and description use the full content width.
- Given the detail page at 1440px, When rendered, Then no empty box sits under the cover.
- Given a title with 138 chapters, When the list renders, Then far fewer rows are mounted and all stay reachable by scroll and keyboard.
- Given a card or detail page, When provider data has no status or only an id, Then the provider's display name shows and `unknown` does not.

## Out of scope

Colors, materials, motion and new components.
