# Design System: MangaVerse

**Project ID:** none — this file was synthesized from the repository itself (no Stitch MCP server is
configured in this environment, and no Stitch project exists for MangaVerse). A future Stitch round
can diff its output against this document instead of regenerating it.

**Provenance (for that future round).** Every value below was read from the running codebase, not
invented:

- `packages/design-system/src/styles/globals.css` — the Tailwind v4 `@theme inline` mapping, the
  `:root, .light` and `.dark` token sets, the four radii, the font stacks, and the `surface-panel`
  shadow utility.
- `packages/design-system/src/components/**` — the component inventory and its exact class values.
- `packages/motion/src/tokens/duration.ts` and `reader-safe/chrome.ts` — the motion scale.
- `packages/theme/src/presets.ts` + `apply-theme.ts` — the theme layer that re-paints the same CSS
  variables at runtime.
- `docs/Design.md` — the standing design notes. This document must never contradict them.

Semantic token names below are the CSS custom properties as written (`--background`,
`--reader-background`, …), which Tailwind exposes as `bg-background`, `bg-reader-background`, and so
on through the `@theme inline` block.

## 1. Visual Theme & Atmosphere

MangaVerse is a **warm-paper reading room bolted to a powerful source engine**. The atmosphere is
cinematic minimalism turned inward: ink-dark type on parchment neutrals, hairline sandstone borders,
and almost no decoration competing with cover art or page scans. Where a generic app reaches for
purple gradients and glass, MangaVerse reaches for a reading lamp.

The interface is **calm, tactile and library-like**. Warmth comes from the neutral ramp itself —
parchment `#f7f5f2`, toasted almond accents, cream highlights — so a long session feels like paper
rather than a dashboard. Depth is nearly flat: a whisper of shadow (`0 1px 2px` at 4% black) lifts a
panel, and nothing else casts. In dark mode the same room goes unlit: midnight ink `#0c0b0a`, warm
bone type, and a faint inner highlight along the top edge of raised panels that reads as lamplight on
a surface.

The mood splits by surface, and that split is the system's core rule:

- **The reading stage is silent.** Reader chrome floats as a black gradient over the page, appears
  only on demand, and disappears completely. Nothing decorative animates near page content.
- **The surrounding product may breathe.** Discovery, onboarding, and theme previews carry the
  staggered fades and lifts that the reader forbids.

Geometry is **gently squared, never playful**: 10px panel corners (`--radius-box`, `0.625rem`), 7px
control corners (`--radius-control`, `0.4375rem`), 8px button corners (`--radius-btn`, `0.5rem`), and
pills only where the form is the point — the badge and the switch track (`--radius-badge`, `9999px`).
Density is generous on desktop (24–32px page padding) and breathable on mobile, with controls sized
for thumbs rather than cursors.

**Key characteristics**

- Parchment-and-ink neutrals with a single warm accent; no brand hue competing with cover art.
- Flat surfaces, hairline borders, shadows measured in single pixels.
- Reading-first calm: the reader strips to black, chrome, and progress.
- A calm shell that can express itself in discovery and onboarding without touching reader geometry.
- Light and dark are the same room at two times of day — same roles, inverted values.
- Theme presets may repaint every token, but never the semantics, radii, or component behaviour.

## 2. Color Palette & Roles

Every value is a token from `globals.css`. Light is `:root, .light`; dark is `.dark`. The theme layer
(`packages/theme/src/presets.ts`) can override most variables at runtime — 27 of the 29 keys it
repaints, starting from the `default` preset, "Minimal" — but the roles below are fixed.

### Foundation (light → dark)

- **Warm Parchment** `#f7f5f2` → **Midnight Ink** `#0c0b0a` — `--background`. The app canvas behind
  everything. Light is paper under daylight; dark is an unlit room, deliberately darker than the
  surfaces that sit on it.
- **Pure Paper** `#ffffff` → **Deep Ink** `#141210` — `--surface`, `--card`. Panels,
  cards, dialogs and sheets. In light mode surfaces float *above* the parchment; in dark they lift
  *off* the black.
- **Pure Paper** `#ffffff` → **Espresso** `#1c1917` — `--surface-raised`, `--popover`. The explicit "one layer up"
  token for dialogs, sheets and the command palette.

### Type (light → dark)

- **Deep Ink** `#141210` → **Warm Bone** `#f5f2eb` — `--foreground`, `--card-foreground`,
  `--popover-foreground`. Never pure black, never pure white: both carry a warm cast so long reading
  does not glare.
- **Warm Ash** `#6b6560` → **Smoke Gray** `#a8a29e` — `--muted-foreground`. Provider attribution,
  descriptions, timestamps, diagnostics. Visibly recessive, never below AA on its surface.
- **Soft Linen** `#ece8e3` → **Charred Linen** `#1a1816` — `--muted`, `--secondary`. Quiet fills:
  skeleton pulses, tab-list troughs, secondary buttons.

### Lines

- **Sandstone Hairline** `#e3ddd4` → **Charcoal Hairline** `#2a2724` — `--border`, `--input`,
  `--sidebar-border`. Every divider and control outline. The system prefers a 1px line to a shadow
  for separation.

### Interaction

- **Near-Black Espresso** `#1c1917` → **Warm Bone** `#f5f2eb` — `--primary`. Primary actions and
  active emphasis. The inversion is intentional: the primary button is ink on paper in light mode and
  bone on ink in dark.
- **Cream** `#faf8f5` → **Midnight Ink** `#0c0b0a` — `--primary-foreground`. Text on a primary
  surface.
- **Toasted Almond** `#e8e2d9` → **Ash Almond** `#262320` — `--accent`. Hover
  fills, selected rows, the warm personality of the palette. Paired with `--accent-foreground`
  (`#1c1917` → `#f5f2eb`).
- **Stone Focus** `#a8a29e` → **Slate Focus** `#57534e` — `--ring`. The 2px focus ring on every
  interactive control, offset 2px from the edge. Focus is never removed, only restyled by theme.

### Status (reserved — never decorative)

- **Signal Red** `#dc2626` → `#ef4444` — `--destructive`. Deletion, uninstall, destructive restore,
  and the content-rating badge. Paired with `--destructive-foreground` `#fafafa`.
- **Confirm Green** `#16a34a` → `#22c55e` — `--success`. Completed backup, restore, migration.
- **Caution Amber** `#d97706` → `#f59e0b` — `--warning`. Provider limitations, risky operations.

Status colour is never the only signal: it always travels with a label, icon or badge text.

### Reading surface (the tokens that make MangaVerse itself)

- **Paper Cream** `#faf8f5` → **Midnight Ink** `#0c0b0a` — `--reader-background`. A dedicated reading
  token, independent of `--background`, so the page area can stay pale while the app chrome darkens
  (or the reverse). This is what the reader settings and theme previews read as "the page".
- The reader stage itself paints the deepest ink available (`bg-black`) behind page art, so scans and
  covers are never tinted by the app surface. Chrome above it is a black gradient
  (`from-black/80 to-transparent`) with white type — the only place in the system where white text on
  black is the default.

### Navigation rail

- **Warm Stone** `#f0ece6` → **Ink Rail** `#0f0e0d` — `--sidebar`. A half-step away from the canvas,
  so the rail reads as furniture rather than content. Completed by `--sidebar-foreground`
  (`#141210` → `#f5f2eb`), `--sidebar-border` (`#e3ddd4` → `#2a2724`), `--sidebar-accent`
  (`#e8e2d9` → `#1c1917`) and `--sidebar-accent-foreground` (`#1c1917` → `#f5f2eb`).

## 3. Typography Rules

**Primary family:** Inter (`--font-family-sans`), falling back to `ui-sans-serif, system-ui,
sans-serif`. **Display** is Inter too (`--font-family-display`) — hierarchy is carried by weight and
size, not by a second face. **Mono:** JetBrains Mono (`--font-family-mono`), falling back to
`ui-monospace, monospace`, reserved for logs, extension IDs, checksums and keyboard hints.

Both families are declared as stacks only; no webfont is bundled, so rendering falls back to the
system UI face wherever Inter or JetBrains Mono is not installed. Treat the stacks as the intent and
the fallbacks as today's reality.

**Global character.** Body copy is set at line-height `1.55` with `letter-spacing: -0.011em` and the
OpenType character variants `cv02`, `cv03`, `cv04`, `cv11` enabled. The negative tracking is what
makes the interface read as precise rather than airy; headlines tighten further with
`tracking-tight`. Long-form prose relaxes to `leading-relaxed`.

### Hierarchy in use

- **Page title (H1)** — bold (700), `text-2xl`, `tracking-tight`. Paired in the same row with a
  count badge and a `text-sm` muted description. Used by `PageHeader` on library, discover and
  search.
- **Panel title (H2/H3)** — semibold (600), `text-2xl` on `CardTitle`, `text-lg` on dialog and sheet
  titles, `leading-none` with `tracking-tight`. Settings sections override down to `text-base`.
- **Manga title** — semibold (600), `text-sm` with `leading-tight` in grid cards (clamped to two
  lines), `text-base` in list rows, `text-sm` clamped to one line in compact rows.
- **Body / control text** — regular (400) at `text-sm`; medium (500) at `text-sm` for buttons,
  labels and tab triggers; `text-base` for alert titles in error states.
- **Meta and captions** — regular `text-xs` in `--muted-foreground`: provider IDs, page counters
  (`1 / 24`), chapter counts, descriptions.
- **Micro-labels** — `text-[10px]` for tag chips on cards and keyboard hints in the sidebar;
  `text-[8px]` only inside the compact card's content-rating badge. Command-palette group headers use
  `text-xs font-semibold uppercase tracking-wide`.
- **Diagnostics** — mono for identifiers and diagnostic values (`DiagnosticsPage`, `StoragePage`), at
  the surrounding size.

**Spacing of type.** Headers sit in a `space-y-1.5` / `gap-2` stack with their description; page
headers use `gap-4` before their action row; settings sections separate title from body with `pb-4`
and a closing separator at `mt-4`.

## 4. Component Stylings

### Buttons

- **Shape:** gently squared — 8px (`--radius-btn`). The `sm` size tightens to 7px (`--radius-control`)
  so it matches the inputs beside it. Never pill, never square.
- **Sizes:** default `h-10 px-4 py-2`; small `h-9 px-3`; large `h-11 px-8`; icon `h-10 w-10`. The
  default control is 40px tall and the small size 36px; `docs/Design.md` sets the 44px touch-target
  preference.
- **Primary:** `--primary` fill with `--primary-foreground` text, darkening to 90% opacity on hover.
  Label is medium (500) `text-sm`, with a `gap-2` slot for a 16px icon.
- **Destructive:** `--destructive` fill; reserved for actions that lose data, always with a
  confirmation dialog.
- **Outline:** 1px `--border` on the canvas colour, filling with `--accent` on hover.
- **Secondary:** `--secondary` fill at 80% on hover. **Ghost:** no chrome until hover, when it takes
  `--accent` — this is the default for icon-only controls such as reader chrome, where it inverts to
  `hover:bg-white/20` on the black gradient.
- **Link:** `--primary` text with a 4px underline offset.
- **Focus:** a 2px `--ring` ring, offset 2px, on `:focus-visible` — identical on every variant.
- **Disabled:** 50% opacity, pointer events off.

### Cards & containers

- **Shape:** 10px (`--radius-box`) corners, 1px `--border`, `--card` background, `shadow-sm`.
- **Padding:** `p-6` on header, content and footer; content drops its top padding to sit tight under
  the header. Internal rhythm is `space-y-1.5`.
- **Hover:** only for interactive cards (manga cards, theme previews) — a `shadow-md` and, on manga
  cards, a 2px lift at 1.02 scale over 200ms. Static panels never animate.
- **Manga card:** a 3:4 portrait button. Grid variant stacks a full-bleed cover (7px corners on
  `--muted`) with the title overlaid at `bottom-0 p-3`; list variant is a `gap-4 p-3` row with an
  80×56 cover; compact is `gap-3 p-2` with a 64×48 cover. Provider ID sits at `text-xs` muted; up to
  three tags render as outline badges at `text-[10px]`. A content rating above `safe` plants a
  destructive badge at `top-2 right-2` — text, not colour alone.
- **`surface-panel` utility:** the plain panel recipe used outside the card component —
  `--surface` background, 1px `--border`, 10px corners, `0 1px 2px rgb(0 0 0 / 0.04)`. In dark mode
  the shadow deepens to `0 1px 2px rgb(0 0 0 / 0.35)` and gains an inset
  `0 1px 0 rgb(255 255 255 / 0.03)` highlight — the system's one piece of depth craft.
- **Empty and error states:** empty states centre a 48px muted icon at 50% opacity, a `text-lg`
  semibold title, a `max-w-sm text-sm` muted explanation, and a single primary action at `mt-6`.
  Errors reuse the panel recipe at `max-w-lg p-6` with a borderless destructive alert inside.

### Inputs & forms

- **Stroke:** 1px `--border` (`--input` shares the value), `--background` fill, 7px corners, `h-10`
  with `px-3 py-2` at `text-sm`. Selects match exactly.
- **Placeholder:** `--muted-foreground` — visible, never a ghost.
- **Focus:** 2px `--ring` at 2px offset, replacing the outline entirely.
- **Labels:** `text-sm font-medium leading-none`, immediately above their control, dimming with the
  field when disabled.
- **Switch:** a 24×44 pill (`--radius-badge`) with a 20px circular thumb that carries `shadow-md`.
- **Slider:** a native range input with a transparent track and a 16px circular `--primary` thumb;
  the reader's page rail is the same idea on the chrome gradient — an 8px white-at-25% track, a 16px
  white thumb with a plain shadow, and a fill that moves by transform only over 180ms.
- **Tabs:** a 40px trough at 7px radius on `--muted`, with the active trigger taking the canvas
  colour plus `shadow-sm` — the only place a tab looks raised.
- **Command palette:** a `max-w-xl` panel 12vh from the top, over a `bg-black/55` blurred scrim; an
  `h-11` borderless search field, `text-xs uppercase tracking-wide` group headers, and rows that hover
  on `--muted` at 70% and take `--accent` with a hairline ring when selected.
- **Dialogs:** `max-w-lg`, 10px corners, `--popover` surface, `p-6`, `shadow-lg`. **Sheets** slide
  from the right by default (`w-3/4 max-w-sm`), or span the full width with 16px rounded top/bottom
  edges; the scrim is `bg-black/60` with a small blur; opening runs 300ms, closing 200ms.

## 5. Layout Principles

### Shell

- A full-height flex row: navigation rail, scrolling main column. The reader route opts out entirely
  into `fixed inset-0` with no global navigation.
- **Desktop rail:** 220px expanded, 52px collapsed over a 200ms ease-out transition, on `--sidebar`
  with a right hairline border, collapsing with `Cmd/Ctrl+B`. Rows are 36px tall (`h-9`) at `text-sm
  font-medium`, `gap-3` apart, with 20px icons; the active row takes the `secondary` fill and hover
  takes `--accent`. The collapse control and a mono keyboard hint (backed by `--sidebar-accent`) sit
  at the rail's foot.
- **Mobile:** a 56px bottom bar at 95% canvas opacity with a backdrop blur, a top hairline border, and
  a safe-area inset; four destinations (Discover, Library, Search, Settings) with 20px icons and
  `text-xs` labels, the active one in `--primary`, plus a ghost "More" button that opens a sheet of
  the secondary destinations. Main content reserves `pb-16` so nothing hides beneath it.

### Page structure

- **Browsing pages** (library, discover) use a wide canvas: `max-w-[1600px]` centred, `p-6` rising to
  `p-8` on desktop, with `gap-6` between header, filters and grid.
- **Text-heavy pages** (settings, diagnostics) cap at `max-w-3xl p-6`; theme customisation at
  `max-w-5xl` with `space-y-8`. The cap is what keeps settings readable at 4K.
- **Detail pages** put a 160px cover (192px from `md`) beside the metadata, with the description
  capped at `max-w-3xl`; chapter lists are a single bordered, divider-separated block rather than a
  grid of cards.
- Page headers place the title, count badge and description on the left and actions on the right,
  stacking vertically below `sm`.

### Grids

- **Library:** 2 columns on mobile, 3 at `sm`, 4 at `md`, 5 at `lg`, 6 at `xl`, `gap-4`. List mode
  drops to `grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3` for dense management.
- **Discover:** 2 → 3 → 4 → 6 columns at the same `gap-4`, with one provider tablist above the
  section stack.
- **Extensions and theme previews:** 1 → 2 → 3 columns at `gap-4`/`gap-6`, previews capped at 280px.
- Long grids are virtualised; skeletons follow the same column rhythm up to `lg` (the grids add a
  sixth column at `xl`) so the layout does not shift when content lands.

### Whitespace & rhythm

- Page padding is 24px on mobile, 32px on desktop. Internal stacks use `gap-4`/`gap-6`; card interiors
  use 24px; a settings section separates from the next with a 16px `mt-4` separator.
- Whitespace is the primary separator. Borders second. Shadows a distant third.
- Reader chrome floats over the page with `px-4 py-3` (top) and `px-4 py-2` (rail) — dense enough to
  stay out of the way, never overlapping tap zones.

### Motion

- Duration scale (`packages/motion`): instant `0ms`, micro `90ms`, quick `140ms`, standard `220ms`,
  expressive `360ms`, cinematic `520ms`. Chrome shows at 140ms and hides at 90ms; the reader mode
  pill morphs in 280ms.
- Easing: `power2.out` for standard exits, `power3.inOut` for state changes, `expo.out` for emphasis,
  `power1.out` for soft entrances, `back.out(1.2)` for snap feedback, `none` for scrubbed motion.
- Transform and opacity only. Reader gestures, zoom, pan and preloading always outrank animation, and
  `prefers-reduced-motion` collapses every effect to an instant state change.

## 6. Notes for a Future Stitch Generation Round

- **Say "warm parchment and ink", not "light gray".** The neutrals carry a deliberate warm cast
  (`#f7f5f2`, `#ece8e3`, `#e8e2d9`); a cool gray rebuild loses the product's character.
- **Say "gently squared corners" (10px panels, 7px controls, 8px buttons) and "pill badges".** The
  badge and the switch track are the pills.
- **Say "hairline sandstone borders with a whisper of shadow"**, not "card with drop shadow". Depth is
  one pixel deep by design.
- **Say "ink-on-paper primary button"** for `--primary` `#1c1917` on light, and let it invert to warm
  bone in dark.
- **Keep the reader silent:** black stage, gradient chrome, white type, progress rail, no ambient
  motion, no decorative overlay on page content.
- **Reference the reading token explicitly** — "reader background `--reader-background` `#faf8f5` /
  `#0c0b0a`, independent of the app background".
- **Check `docs/Design.md` before shipping a generated screen.** It holds the binding rules
  (reading-first, accessibility, motion bans, theme semantics) that this document summarizes.
