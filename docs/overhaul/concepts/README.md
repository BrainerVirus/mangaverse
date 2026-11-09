# Liquid glass concepts

Approved by the owner on 2026-11-09 for issue #228. They satisfy spec 9 V5 (concept screens before any
redesign code) and use Apple's liquid glass as the reference, adapted to be playful and welcoming (V1).

| Screen       | Light                                                     | Dark                                 |
| ------------ | --------------------------------------------------------- | ------------------------------------ |
| Library      | [library-light.png](library-light.png)                    | [library-dark.png](library-dark.png) |
| Manga detail | [detail-light.png](detail-light.png)                      | [detail-dark.png](detail-dark.png)   |
| Reader       | [reader.png](reader.png) (the stage is theme-independent) | same                                 |

These are static mockups, not the running app. `concept.html` renders all six: open it with a hash,
for example `concept.html#lib,dark` (`lib`, `det` or `rdr`, then `light` or `dark`). It carries a copy
of the glass tokens from `packages/design-system/src/styles/globals.css` as of that date, so it is a
snapshot and does not follow later token changes.

## Existing, unchanged

The four glass tiers, the specular edge and sheen, the elevation scale, the type roles and the reader's
black stage with its dark glass chrome (DESIGN.md §2, §4, §7.6).

## Approved changes

These have no token in the repository yet; #230 introduces them.

1. **Vivid coral accent**: `#ff5a3c` (light), `#ff7a5c` (dark), for primary actions, unread badges and
   reading progress. It replaces the monochrome primary on those surfaces.
2. **Colour wash behind the shell**: peach, lavender and mint in light; plum, indigo and teal in dark,
   as the ambient backdrop the glass refracts (DESIGN.md §2.3). The detail page also glows with a blurred
   enlargement of its cover.
3. **Larger radii**: 18px for boxes and 24px for glass, up from 10px and 14px.
4. **Pill-shaped controls**: fully rounded buttons, search field and segmented control, with a raised
   glass pill for the selected option.

## Open until implemented

- **Contrast over the colour wash is not measured.** The concepts use the existing glass tiers, which are
  specified for it (DESIGN.md §3.5), but every text and control pair over the wash must be measured over
  a light and a dark backdrop before #230 lands.
- The reader keeps its calm rules: no colour wash behind the page, and no decoration over page art. Its
  restyle waits on #224.
- Reduced transparency, the low-end profile and `prefers-reduced-motion` keep resolving glass to solid
  surfaces (spec 9 Behavior).
