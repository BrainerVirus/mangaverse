---
# MangaVerse — target design language (liquid glass), reader-first.
# Consumed by the shadcn design-system workflow: frontmatter -> token mapping -> cva variants ->
# design-system page -> verify. Values are EXISTING tokens (verified against the code, see §11) unless
# marked "proposed"; a proposed value has no token in the repository yet.
project: MangaVerse
direction: liquid glass — calm, deep, luminous; water and glass, not plastic
colors:
  canvas: { light: "#f7f5f2", dark: "#0c0b0a" } # EXISTING --background
  surface: { light: "#ffffff", dark: "#141210" } # EXISTING --surface / --card
  surface-raised: { light: "#ffffff", dark: "#1c1917" } # EXISTING --surface-raised / --popover
  ink: { light: "#141210", dark: "#f5f2eb" } # EXISTING --foreground
  muted-ink: { light: "#6b6560", dark: "#a8a29e" } # EXISTING --muted-foreground
  muted: { light: "#ece8e3", dark: "#1a1816" } # EXISTING --muted / --secondary
  line: { light: "#e3ddd4", dark: "#2a2724" } # EXISTING --border / --input
  primary: { light: "#1c1917", dark: "#f5f2eb" } # EXISTING --primary
  on-primary: { light: "#faf8f5", dark: "#0c0b0a" } # EXISTING --primary-foreground
  accent: { light: "#e8e2d9", dark: "#262320" } # EXISTING --accent
  ring: { light: "#78716c", dark: "#a8a29e" } # EXISTING --ring; P1 fix, 4.41:1 / 7.80:1 (§3.3)
  reader: { light: "#faf8f5", dark: "#0c0b0a" } # EXISTING --reader-background
  destructive: { light: "#dc2626", dark: "#ef4444" } # EXISTING --destructive
  success: { light: "#16a34a", dark: "#22c55e" } # EXISTING --success
  warning: { light: "#d97706", dark: "#f59e0b" } # EXISTING --warning
  glass-thin: { light: "rgb(255 255 255 / 0.55)", dark: "rgb(20 18 16 / 0.55)" } # EXISTING (P1)
  glass-regular: { light: "rgb(255 255 255 / 0.68)", dark: "rgb(20 18 16 / 0.66)" } # EXISTING (P1)
  glass-thick: { light: "rgb(255 255 255 / 0.82)", dark: "rgb(20 18 16 / 0.78)" } # EXISTING (P1)
  glass-stage: { any: "rgb(0 0 0 / 0.78)" } # EXISTING (P1); reader only, theme-independent
typography:
  display: Inter (EXISTING --font-family-display)
  body: Inter (EXISTING --font-family-sans)
  mono: JetBrains Mono (EXISTING --font-family-mono)
  body-size: 14px / 1.55 / -0.011em # 14px is the text-sm convention the components use, not a global size: body sets only 1.55 and -0.011em and inherits 16px
  label-size: 14px / 500 (EXISTING)
  micro-size: 11px / 500 (proposed; 10px today)
rounded:
  box: 10px (EXISTING --radius-box)
  control: 7px (EXISTING --radius-control)
  button: 8px (EXISTING --radius-btn)
  badge: 9999px (EXISTING --radius-badge)
  glass: 14px (EXISTING --radius-glass, P1)
spacing:
  page: 24px mobile / 32px desktop (EXISTING)
  stack: 16px / 24px (EXISTING)
  reader-chrome: 12px top bar / 8px rail (EXISTING px-4 py-3, px-4 py-2)
components:
  button: ink-on-paper primary, 8px corners, 40px default / 36px small / 44px touch (EXISTING)
  card: glass-regular over the ambient canvas, 14px corners, elevation-1 (proposed material)
  sheet: glass-thick, 32px blur, elevation-4 (proposed material)
  input: 1px --border, 40px, 7px corners, 2px --ring focus (EXISTING)
  tabs: 40px trough on --muted, raised active trigger (EXISTING)
  reader-chrome: glass-stage over the page, white type, gradient + plate (proposed material)
---

# Design System: MangaVerse

**Status: target design language.** This file specifies what MangaVerse must look like once the
liquid-glass rebuild lands — not a description of today's components. §11 states honestly what exists
today versus what is new; §13 is the ordered plan that closes the gap. When this file and the code
disagree, this file is the intent and the code is the work.

**Project ID:** none. There is no Stitch project for MangaVerse and no Stitch MCP server in this
environment. This document is synthesized from the repository and the product direction, and a future
Stitch round can diff its output against it instead of regenerating it.

**How to read the values.** Semantic names are the CSS custom properties (`--background`,
`--glass-thick`, …) that Tailwind exposes through the `@theme inline` block in
`packages/design-system/src/styles/globals.css`. Every value is labelled one of:

- **existing** — a token or class in the repository today; verified, not invented.
- **proposed** — no token exists yet; the plan in §13 introduces it. Implementers must not assume it
  is available.

Binding rules for contributors and agents live in `docs/Design.md`, which points here for values.

## 1. Visual Theme & Atmosphere

MangaVerse is **light moving through water**. The atmosphere is calm, deep and luminous: dark water
beneath, a thin sheet of glass floating above it, light catching its edges. Nothing is plastic — no
flat gray slabs, no hard borders standing in for depth, no shadows that read as dirt. A surface either
belongs to the page (opaque, quiet, matte) or floats above it (translucent, blurred, edged in light).

The rebuild keeps the product's warmth and replaces its flatness. Warm parchment and ink neutrals stay:
they are the identity, and cover art needs a neutral room. What changes is the material — panels stop
being rectangles with a 1px line and become **glass that refracts what is behind it**, and depth stops
being a single pixel of shadow and becomes a four-step elevation scale with a light edge on top of every
raised layer.

The room has two halves, and that split is still the system's core rule:

- **The reading stage is water at night.** The stage floor is the deepest ink available (`bg-black`),
  page art floats on it untouched, and the chrome is a single sheet of dark glass that appears on
  demand and dissolves completely. No decoration, no ambient motion, no second layer over a page.
- **The surrounding product is daylight on a surface.** Discovery, library, settings and onboarding sit
  on an ambient warm backdrop, so the shell's glass has something real to refract; they may stagger,
  lift and settle.

**Design philosophy**

1. **Light, not paint.** Depth is built from translucency, blur, a 1px light edge and an inner shadow.
   A hard border is the last resort, never the first idea.
2. **Glass shows the thing behind it.** Glass exists to keep context visible — the page under the
   chrome, the cover under the shelf. Glass over nothing is a flat panel with extra cost.
3. **The page outranks the interface.** In the reader, chrome is a temporary state; the page is the
   product. If an effect competes with page art, the effect loses.
4. **Calm is a performance feature.** Motion or material that costs frames during reading is a bug,
   not a flourish.
5. **Every material has a fallback.** Blur, transparency, refraction and motion each degrade to an
   opaque, still equivalent that keeps the hierarchy intact.
6. **Warmth in the substrate, precision in the light.** Neutrals stay warm; edges, hairlines and
   specular highlights stay exact.

**Key characteristics**

- A four-tier glass material (`thin`, `regular`, `thick`, `stage`) with fixed blur, saturation and
  alpha values — not free-form `backdrop-blur` choices per component.
- Light and dark are the same room at two times of day: same roles, inverted values, same material
  behaviour.
- Refraction is layered light (sheen + specular edge + inner shadow) on every glass surface; true
  displacement refraction is an opt-in hero effect, never the default (§2).
- Depth is a four-step elevation scale, mapped onto Tailwind's shadow tokens, with a top light edge in
  dark mode.
- Reading-first calm: the reader strips to black, glass, and progress; the surrounding product may
  breathe.
- Touch and pointer are two designed contracts, not one layout with extra hover rules (§6).
- Theme presets may repaint every colour token, but never the material, radii, elevation scale or
  component behaviour.

## 2. Material System — Glass, Water, Light

This is the core of the rebuild. Every surface in MangaVerse is one of two things: **matte** (opaque,
`--surface` / `--card`, no blur) or **glass** (translucent, blurred, edged). Glass is never improvised;
it is one of four tiers, each with a fixed fill alpha, blur radius and saturation.

### 2.1 The four glass tiers (landed in P1)

> **Implementation:** the fills are `--glass-thin/regular/thick/stage` in
> `packages/design-system/src/styles/globals.css`, registered as `--color-glass-*`; each tier is an
> `@utility` (`glass-thin`, `glass-regular`, `glass-thick`, `glass-stage`) that owns its fill, its
> `backdrop-filter`, its saturation and its opaque resolution. `GlassSurface` is the only consumer of
> those tier utilities. The shared `glass-scrim` utility is the sole non-tier exception that sets
> `backdrop-filter` (modal scrims only: 55% black with 8px blur).

| Tier    | Token             | Fill, light                            | Fill, dark            | `backdrop-filter`           |
| ------- | ----------------- | -------------------------------------- | --------------------- | --------------------------- |
| Thin    | `--glass-thin`    | `rgb(255 255 255 / .55)`               | `rgb(20 18 16 / .55)` | `blur(12px) saturate(140%)` |
| Regular | `--glass-regular` | `rgb(255 255 255 / .68)`               | `rgb(20 18 16 / .66)` | `blur(20px) saturate(160%)` |
| Thick   | `--glass-thick`   | `rgb(255 255 255 / .82)`               | `rgb(20 18 16 / .78)` | `blur(32px) saturate(180%)` |
| Stage   | `--glass-stage`   | `rgb(0 0 0 / .78)` (theme-independent) | same                  | `blur(24px) saturate(120%)` |

Saturation above 100% is what separates glass from fog: it restores the colour the blur washes out, so
cover art behind a toolbar still looks like art rather than gray mush.

**Where each tier is used** (the only legal placements):

- **Thin** — glass whose backdrop is a known flat surface, so its blur pass has almost nothing to do:
  tab troughs inside a glass panel, hover washes, skeleton shimmer over the ambient canvas, chips that
  sit on an opaque card. **Thin never carries text over imagery** (§3.5 explains why, with numbers).
- **Regular** — floating toolbars and sticky page headers over the ambient canvas, popovers, cards
  that overlay imagery (shelf rows, "continue reading" tiles).
- **Thick** — anything that owns the foreground while the app stays visible behind it: sheets,
  dialogs, the command palette, the mobile bottom bar, the navigation rail (desktop and settings), the
  reader's settings sheet.
- **Stage** — the reader chrome only (top bar, bottom rail, chapter transition card, the offline
  toast). It is theme-independent: the reading stage is always black, so its glass is always dark and
  its type is always white.

### 2.2 Refraction: layered light, not a displacement filter (layered light landed in P1)

**Decision (proposed): refraction is layered gradients plus edge light, and an SVG
`feTurbulence` + `feDisplacementMap` filter is an opt-in hero effect only.** The reasoning, so nobody
re-opens it by accident:

- A displacement filter re-rasterizes a full-surface filter pass every time the content behind the glass
  changes. Behind a reader toolbar that is every scroll, every page turn, every zoom step — exactly
  where the reader's frame budget lives.
- `feDisplacementMap` output is not composited on the GPU in every engine, so it costs CPU on the
  devices that can least afford it, and it forces a stacking-context change that breaks `position:
  fixed` chrome.
- Layered light is cheap and animates with `transform`/`opacity` alone: a vertical sheen, a 1px specular
  edge, an inner bottom shadow and a slightly brighter top-inner glow read as a curved glass surface at
  a fraction of the cost.

The layered recipe (landed in P1 as the `RefractionLayer` primitive, `aria-hidden`,
`pointer-events: none`, rendered by `GlassSurface` at `-z-10` so the light never sits over content):

1. **Sheen** — `--glass-sheen` (EXISTING, P1): light
   `linear-gradient(180deg, rgb(255 255 255 / .22), rgb(255 255 255 / 0) 45%)`; dark
   `linear-gradient(180deg, rgb(255 255 255 / .06), rgb(255 255 255 / 0) 45%)`; stage
   `linear-gradient(180deg, rgb(255 255 255 / .10), rgb(255 255 255 / 0) 60%)`. Sits at the top of the
   layer, never animates. (Use `rgb(255 255 255 / 0)` rather than `transparent`: the keyword interpolates
   through transparent black and leaves a gray fringe on some engines.)
2. **Specular edge** — `--glass-specular` (EXISTING, P1): light `rgb(255 255 255 / .70)`, dark
   `rgb(255 255 255 / .10)`, stage `rgb(255 255 255 / .22)`. A 1px inset top stroke
   (`inset 0 1px 0 var(--glass-specular)`), the single detail that makes a layer read as lit glass.
3. **Inner bottom shadow** — `--glass-inner` (EXISTING, P1): light `inset 0 -1px 0 rgb(0 0 0 / .05)`, dark
   `inset 0 -1px 0 rgb(0 0 0 / .45)`. Gives the sheet thickness.
4. **Hairline** — `--glass-edge` (EXISTING, P1): light `rgb(255 255 255 / .50)`, dark
   `rgb(255 255 255 / .08)`, stage `rgb(255 255 255 / .14)`. A 1px border that replaces `--border` on
   glass; a warm sandstone line over an unknown backdrop would read as a seam, not an edge.

The SVG variant (proposed `RefractionLayer variant="displacement"`) is allowed on exactly two surfaces:
the chapter-transition card and the onboarding hero. It must be off under reduced motion, reduced
transparency and the low-end profile (§2.5), and must never sit over a scrolling page surface.
**Shipped (#95):** the onboarding hero opts in; the chapter-transition card does not exist yet, so the
second allowance is unused. The filter lives on the `GlassSurface` element itself (a nested child
`backdrop-filter` samples nothing inside the parent backdrop root).

### 2.3 Ambient backdrop — what the glass refracts (landed in P1)

Glass over a flat single-colour canvas is a flat panel with a blur bill. The target adds a **backdrop
band**: a fixed, `aria-hidden`, non-interactive layer behind the shell's content (EXISTING tokens
`--ambient-1`, `--ambient-2`: light `#efe9e1` / `#f7f5f2`, dark `#17140f` / `#0c0b0a`), painted as two
very low-contrast radial gradients anchored top-left and bottom-right of the viewport. The
`AmbientBackdrop` primitive renders it; the shell (P4) renders it once.

Rules: it never scrolls with content (so the glass always has a stable thing to refract), it never
animates except a ≤ `expressive` (360ms) entrance, and it disappears entirely under reduced motion,
reduced transparency or the low-end profile, leaving `--background`. In the reader it does not exist —
the page art is the backdrop. **Shipped (#95):** a 220ms `routeEnter` transform/opacity entrance that
waits for the resolved glass profile, stays static under every fallback, and is hidden until
`data-glass="full"` so there is no flash; the reduced-motion end state remains static.

### 2.4 Elevation & depth scale (landed in P1, mapped onto Tailwind)

Four steps, verbatim, applied as `box-shadow`. Dark mode multiplies alpha and keeps the inset light
edge from `--glass-specular` (or `rgb(255 255 255 / .03)` on matte surfaces, matching today's
`surface-panel`).

| Step        | Token (EXISTING, P1) | Light                                                      | Dark                                                               |
| ----------- | -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 1 — whisper | `--elevation-1`      | `0 1px 2px rgb(0 0 0 / .04)`                               | `0 1px 2px rgb(0 0 0 / .35), inset 0 1px 0 rgb(255 255 255 / .03)` |
| 2 — float   | `--elevation-2`      | `0 1px 2px rgb(0 0 0 / .05), 0 8px 24px rgb(0 0 0 / .08)`  | `0 1px 2px rgb(0 0 0 / .40), 0 8px 24px rgb(0 0 0 / .45)`          |
| 3 — lift    | `--elevation-3`      | `0 2px 4px rgb(0 0 0 / .06), 0 16px 40px rgb(0 0 0 / .12)` | `0 2px 4px rgb(0 0 0 / .45), 0 16px 40px rgb(0 0 0 / .55)`         |
| 4 — overlay | `--elevation-4`      | `0 24px 64px rgb(0 0 0 / .22)`                             | `0 24px 64px rgb(0 0 0 / .60)`                                     |

Assignment: matte cards and the `surface-panel` recipe stay at step 1; sticky bars and floating
toolbars at step 2; hovered cards, popovers and the command palette at step 3; sheets, dialogs and the
mobile bottom bar at step 4. Glass layers additionally carry the inner shadows from §2.2 — elevation
is the shadow the layer casts, the specular edge is the light it catches.

Tailwind wiring (per the shadcn workflow's Step 4, in `@theme`, not `@theme inline`):
`--shadow-sm: var(--elevation-1)`, `--shadow-md: var(--elevation-2)`, `--shadow-lg: var(--elevation-3)`,
`--shadow-xl: var(--elevation-4)`. **Landed in P1.** Before the wiring, none of those theme keys was
overridden, so components still used Tailwind's defaults: `Card`'s `shadow-sm` was
`0 1px 3px rgb(0 0 0 / .10), 0 1px 2px -1px rgb(0 0 0 / .10)`, heavier than `--elevation-1`
(`0 1px 2px rgb(0 0 0 / .04)`, the `.surface-panel` whisper), so the mapping **lightens** `Card` rather
than preserving its current value — the one visible consequence of P1 outside `--ring`. Sheets used
Tailwind's default `shadow-lg` (`0 10px 15px -3px rgb(0 0 0 / .10), 0 4px 6px -4px rgb(0 0 0 / .10)`);
the wiring moves `shadow-lg` to `--elevation-3` (lift), so the assignment above — sheets at step 4 —
requires the sheet to move to `shadow-xl` (`--elevation-4`) as part of P5. The wiring alone would leave
it one step shallow.

### 2.5 Performance, fallbacks and constraints

`backdrop-filter` is the most expensive thing in this document. Non-negotiable rules:

- **Budget, counted per view.** The reader's steady state is **1** blurred layer — the chrome container
  (top bar and bottom rail), hidden most of the time — rising to **3** with both transients on screen (the
  rail's preview popover while scrubbing, the offline toast) and **4** while the settings sheet is open:
  chrome, toast, sheet, scrim (the popover cannot coexist with a modal, whose scrim suppresses hovering
  under it). The shell runs 1–2 in normal use (rail, sticky header) and reaches **4** with the command
  palette open (rail, header, panel, scrim). No view adds a fifth blurred layer.
- **Nesting:** two tiers that blur imagery must never nest — the inner pass re-blurs an already-blurred
  composite, doubling the read-back and muddying the colour. The one exception is the **thin** tier,
  whose backdrop is a known flat, already-composited surface: a thin tint inside a glass panel (a tab
  trough, the mode pill over the stage chrome) is legal and does not count as a second blurred layer.
- **Never** put `backdrop-filter` on a large scrolling surface or on a container whose children scroll
  under it. Blur the _chrome_, not the content.
- **Never animate the blur radius or the fill alpha.** Animate the layer's `opacity` and `transform`
  only; the material fades in as a whole. Animating `backdrop-filter` re-rasterizes every frame.
- **Promotion:** no blanket `will-change`. The reader chrome may set `will-change: opacity, transform`
  for the duration of a show/hide tween and must remove it after (`@app/motion` helpers own the
  cleanup). A permanently promoted glass layer doubles memory for no gain.
- **Low-end profile (landed in P1):** when `navigator.hardwareConcurrency <= 4` or `navigator.deviceMemory
  <= 4`, or when the user's OS reports `prefers-reduced-motion: reduce`, set `data-glass="cheap"` on the
  root. Every glass tier then resolves to its opaque equivalent: `--glass-thin` / `regular` →
  `--surface`, `--glass-thick` → `--surface-raised`, `--glass-stage` → `rgb(0 0 0 / .88)`. The hairline,
  specular edge and elevation survive, so the hierarchy is unchanged. The predicate ships as
  `resolveGlassProfile()` in `@app/design-system`; the shell (P4) applies the attribute.
- **No-support fallback (landed in P1):** `@supports not (backdrop-filter: blur(1px))` applies the same
  opaque resolution. Never ship a translucent layer without a blur: the text contrast maths in §3.5
  assumes the blur is doing its part.
- **`prefers-reduced-transparency` (landed in P1):** warranted, and it is the _second_ half of the story.
  Where the UA supports it (Safari 18+/iOS 18+ today; Chromium support is still partial), it resolves
  every glass tier to opaque automatically. Because support is uneven, the reliable path is the
  user-facing **Transparency** setting (Full / Reduced, default Full) in appearance settings, stored
  like every other preference and applied as `data-transparency="solid"` on the root — same resolution
  as `data-glass="cheap"`, plus the ambient backdrop off. The CSS path ships in P1; the setting itself
  is P4/P5.
- **SSR:** glass is CSS-only, so nothing needs a client guard; do not branch rendering on
  `matchMedia` during the first paint.

### 2.6 Vibrancy on translucent surfaces

Vibrancy is how type, icons and controls behave when they sit on glass. The rules, in one place:

- **Colour:** only `--foreground` (or `--glass-muted-foreground` for secondary text) on app glass, and
  `text-white` / `text-white/70` on the reader stage. Never a translucent white/black for text, and never
  `--muted-foreground` (§3.5 rule 1).
- **Weight and size:** the blur softens edges, so glass type is set at weight ≥ 400 and never below 12px
  for secondary text (§4).
- **Icons:** icons inherit the text colour at full opacity; an icon that carries meaning is never dimmed to
  indicate state — state is a fill, a plate, or a badge.
- **Saturation is part of the text contract:** the `saturate()` in each tier's `backdrop-filter` is what
  keeps the backdrop from going gray under the type, so a tier's blur and saturation are never adjusted
  independently.
- **State changes** on glass are fill + specular-edge changes plus one elevation step (§5.3); a hover that
  only changes text opacity is not allowed.
- **The floor:** when a glass layer cannot guarantee the effective backdrop its text was validated
  against, it gets a plate (§3.5 rule 4) — never a text shadow and never a lighter font weight.

## 3. Color Palette & Roles

Every value below is a token from `globals.css` unless marked **proposed**. Light is `:root, .light`;
dark is `.dark`. The runtime theme layer (`packages/theme/src/presets.ts` + `apply-theme.ts`) repaints
27 of these 29 variables across 10 presets — `--surface` and `--surface-raised` are the two it does not
touch. Not all 27 are the preset's 10 colour tokens: `--muted-foreground`, `--destructive-foreground` and
the light `--primary-foreground` are hardcoded in `apply-theme.ts`, and `--muted`, `--secondary` and the
`--sidebar` family reuse the preset's accent and surface. The roles below are fixed regardless. The glass
tokens join the theme layer's list once introduced; presets may tint them, never re-tier them.

### 3.1 Foundation (light → dark)

- **Warm Parchment** `#f7f5f2` → **Midnight Ink** `#0c0b0a` — `--background`. The app canvas behind
  everything: paper under daylight, an unlit room in the dark, deliberately darker than the surfaces
  that sit on it.
- **Ambient Band** `#efe9e1` → `#17140f` — **EXISTING** `--ambient-1` (P1), with `--ambient-2` =
  `--background`. The non-scrolling backdrop the shell's glass refracts (§2.3).
- **Pure Paper** `#ffffff` → **Deep Ink** `#141210` — `--surface`, `--card`. Matte panels.
- **Pure Paper** `#ffffff` → **Espresso** `#1c1917` — `--surface-raised`, `--popover`. The explicit
  "one layer up" token for dialogs, sheets and the command palette, and the opaque resolution of
  `--glass-thick`.

### 3.2 Type

- **Deep Ink** `#141210` → **Warm Bone** `#f5f2eb` — `--foreground`, `--card-foreground`,
  `--popover-foreground`. Never pure black, never pure white: both carry a warm cast so long reading
  does not glare.
- **Warm Ash** `#6b6560` → **Smoke Gray** `#a8a29e` — `--muted-foreground`. Provider attribution,
  descriptions, timestamps, diagnostics. Recessive but never below AA on its own surface.
- **Glass Muted Ink** `#57534e` → `#d6d1ca` — **EXISTING** `--glass-muted-foreground` (P1). The secondary
  text colour for glass surfaces, one step closer to the ink than `--muted-foreground` so it survives a
  blurred, translucent backdrop. Legal placements are in §3.5.
- **Soft Linen** `#ece8e3` → **Charred Linen** `#1a1816` — `--muted`, `--secondary`. Quiet fills:
  skeleton pulses, tab-list troughs, secondary buttons.

### 3.3 Lines & interaction

- **Sandstone Hairline** `#e3ddd4` → **Charcoal Hairline** `#2a2724` — `--border`, `--input`,
  `--sidebar-border`. The hairline for **matte** surfaces. On glass, use `--glass-edge` (§2.2) instead.
- **Glass Hairline** `rgb(255 255 255 / .50)` → `rgb(255 255 255 / .08)` — **EXISTING** `--glass-edge` (P1).
- **Near-Black Espresso** `#1c1917` → **Warm Bone** `#f5f2eb` — `--primary`. Primary actions and active
  emphasis. The inversion is intentional: ink on paper in light, bone on ink in dark.
- **Cream** `#faf8f5` → **Midnight Ink** `#0c0b0a` — `--primary-foreground`.
- **Toasted Almond** `#e8e2d9` → **Ash Almond** `#262320` — `--accent`, with `--accent-foreground`
  (`#1c1917` → `#f5f2eb`). Hover fills, selected rows, the palette's warm personality.
- **Stone Focus** `#78716c` → **Slate Focus** `#a8a29e` — `--ring`, a 2px ring at 2px offset. **Fixed in
  P1.** The old values (`#a8a29e` / `#57534e`) measured **2.32:1** on the light canvas and **2.58:1** on
  the dark canvas — under the 3:1 that WCAG 2.2 requires for a focus indicator. The shipped values
  measure **4.41:1** (light, `#78716c` on `#f7f5f2`) and **7.80:1** (dark, `#a8a29e` on `#0c0b0a`), and
  also clear 3:1 on `--surface`, `--muted` and `--accent` in both modes (light 4.80 / 3.93 / 3.73,
  dark 7.41 / 7.02 / 6.20). The runtime theme layer still paints `--ring` from the preset's `--primary`
  (every one of the 10 presets clears 3:1 on its canvas — lowest is Sakura light at 3.66:1), which
  `packages/theme`'s suite now pins.

### 3.4 Status (reserved — never decorative)

- **Signal Red** `#dc2626` → `#ef4444` — `--destructive`. Deletion, uninstall, destructive restore, and
  the content-rating badge. On glass, light mode needs the darker **proposed** `--destructive-glass`
  `#b91c1c`; dark's `#ef4444` measures 5.03:1 against dark glass (thick, alpha .78) over `--background`
  and needs nothing.
- **Confirm Green** `#16a34a` → `#22c55e` — `--success`. Completed backup, restore, migration. On
  glass, light mode needs the darker **proposed** `#15803d` (4.89:1 on light glass, regular, alpha .68,
  over `--background`).
- **Caution Amber** `#d97706` → `#f59e0b` — `--warning`. Provider limitations, risky operations. On
  glass, light mode needs the darker **proposed** `#b45309` (4.89:1 on the same light-glass fill);
  `#d97706` measures only 3.10:1 there.

Status colour is never the only signal: it always travels with a label, icon or badge text.

### 3.5 The contrast floor on glass (WCAG 2.2 AA, measured)

The floor is **4.5:1** for body text, **3:1** for large text (≥ 24px, or ≥ 19px at weight 600) and for
non-text UI (icons, focus rings, control boundaries). Because a glass layer's backdrop is unknown, the
floor is enforced by _placement rules_ rather than by hoping. Measured worst cases (backdrop = pure
black imagery in light mode, pure white imagery in dark; contrast ratios computed against the effective
composited colour):

| Text on glass                     | Light (ink `#141210`) | Dark (bone `#f5f2eb`) |
| --------------------------------- | --------------------- | --------------------- |
| thin, over imagery                | 5.56:1 — passes       | 3.67:1 — **fails**    |
| regular, over imagery             | 8.33:1                | 5.37:1                |
| thick, over imagery               | 12.24:1               | 8.39:1                |
| any tier, over the ambient canvas | ≥ 16:1                | ≥ 16:1                |

| Secondary text on glass              | Light (`#57534e`)  | Dark (`#d6d1ca`)   |
| ------------------------------------ | ------------------ | ------------------ |
| thin, over imagery                   | 2.27:1 — **fails** | 2.71:1 — **fails** |
| regular, over imagery                | 3.40:1 — **fails** | 3.95:1 — **fails** |
| thick, over imagery                  | 5.00:1             | 6.18:1             |
| thin/regular over the ambient canvas | 7.36:1             | 12.50:1            |

The resulting **hard rules**:

1. `--muted-foreground` (`#6b6560` / `#a8a29e`) is **never** used on glass. Glass secondary text uses
   `--glass-muted-foreground`.
2. **Thin glass carries no text over imagery.** Over the ambient canvas, thin may carry
   `--glass-muted-foreground` text at 12px+ / weight 500.
3. Over imagery (cover art, page scans, video), body text needs **regular or thick** glass;
   `--glass-muted-foreground` needs **thick**.
4. Reader chrome: `--glass-stage` alpha floor is **0.78** for `text-white/70` labels (5.59:1 over a
   white page) and may drop to **0.72** for solid white labels (9.29:1). The existing top-bar gradient
   (`from-black/80 to-transparent`) has no protection where it fades out, so every control row on the
   stage sits on a **plate** — a local fill in the layer's own tone at +0.35 alpha (`--glass-plate`,
   **EXISTING** (P1): `rgb(255 255 255 / .35)` on light glass, `rgb(20 18 16 / .35)` on dark glass,
   `rgb(0 0 0 / .35)` on the stage) — and the label row of the bottom rail carries one too.
5. Text on glass is always opaque (`--foreground` / `--glass-muted-foreground` / `text-white`), never a
   translucent white/black, except the reader's `text-white/70` meta labels, which rule 4 covers.
6. Every glass surface that carries text is verified in the design-system page (§13, P7) over **both** a
   white and a black backdrop. A recipe that only passes over one is not finished.

### 3.6 Reading surface

- **Paper Cream** `#faf8f5` → **Midnight Ink** `#0c0b0a` — `--reader-background`. A dedicated token,
  independent of `--background`, so the page area can stay pale while the app chrome darkens (or the
  reverse).
- The stage floor paints the deepest ink available (`bg-black`) behind page art, so scans and covers are
  never tinted by the app surface. Chrome above it is `--glass-stage` with white type — the only place
  in the system where white-on-black is the default.

### 3.7 Navigation rail

- **Warm Stone** `#f0ece6` → **Ink Rail** `#0f0e0d` — `--sidebar`, completed by `--sidebar-foreground`
  (`#141210` → `#f5f2eb`), `--sidebar-border`, `--sidebar-accent` and `--sidebar-accent-foreground`.
  In the target the rail is a **thick glass sheet** floating over the ambient band (radius
  `--radius-glass`, elevation-4); the opaque `--sidebar` values remain its low-end, reduced-transparency
  and no-blur resolution.

### 3.8 Mapping to shadcn theme variables

The shadcn workflow consumes this file by mapping roles onto its variables, then registering everything
without a slot in `:root` / `.dark` plus `@theme inline`:

| DESIGN.md role            | shadcn variable                                             | Note                                                         |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| canvas / ambient band     | `--background`                                              | band tokens registered separately                            |
| ink                       | `--foreground`, `--card-foreground`, `--popover-foreground` |                                                              |
| primary fill / on-primary | `--primary` / `--primary-foreground`                        |                                                              |
| secondary fill            | `--secondary` / `--secondary-foreground`                    |                                                              |
| quiet band, troughs       | `--muted`                                                   |                                                              |
| secondary text            | `--muted-foreground`                                        | glass variant registered as `--color-glass-muted-foreground` |
| hover wash, selected row  | `--accent` / `--accent-foreground`                          |                                                              |
| card, floating layer      | `--card`, `--popover`                                       |                                                              |
| hairline                  | `--border`, `--input`                                       | glass edge registered as `--color-glass-edge`                |
| focus                     | `--ring`                                                    | fixed in P1 (§3.3)                                           |
| error / success / warning | `--destructive`, `--success`, `--warning`                   | glass variants registered separately                         |
| rail                      | `--sidebar-*`                                               |                                                              |
| glass fills               | `--glass-*` + `--color-glass-*` (EXISTING, P1)              | `--glass-stage` is theme-independent                         |

## 4. Typography Rules

**Families (existing).** Inter (`--font-family-sans`, `--font-family-display`) and JetBrains Mono
(`--font-family-mono`). Display is Inter too: hierarchy is carried by weight, size and tracking, not by a
second face. Both are declared as stacks only — no webfont is bundled, so the system UI face renders
where Inter is not installed. Treat the stacks as the intent and the fallbacks as today's reality.

**Global character (existing).** Body copy is `1.55` line-height with `letter-spacing: -0.011em` and the
OpenType character variants `cv02`, `cv03`, `cv04`, `cv11`. The negative tracking is what makes the
interface read as precise rather than airy. `body` sets no font size: the page inherits the browser's 16px,
and 14px is the components' `text-sm` convention (the `type-body` role below).

**On glass (proposed).** Translucent backdrops cost legibility, so glass type is stricter than matte
type: never lighter than weight 400, never below 12px for secondary text, no tracking below `-0.02em`,
and no `text-shadow` as a contrast crutch (the plate in §3.5 does that job properly). Micro-labels on
glass move from `text-[10px]` to **11px at weight 500** — 10px on a blurred backdrop is below the
comfortable reading floor.

**Tabular numerals (existing rule).** Progress, page counters, chapter counts, storage and diagnostics
use tabular figures (`font-variant-numeric: tabular-nums`) so digits do not jitter as they change.

### Type roles & scale

Sizes are the target; `existing` marks what the components use today, `proposed` marks the new display
step and the glass adjustments. Implement them as `@utility type-*` classes (the shadcn workflow's
convention), **not** as `--text-*` theme keys, because `cn()` treats unknown `text-*` classes as colours
and drops the first of two that sit together.

| Utility (proposed) | Size / line / tracking                              | Weight | Role                                                                   |
| ------------------ | --------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `type-display-xl`  | `clamp(34px, 3vw + 16px, 48px)` / 1.05 / `-0.022em` | 600    | Onboarding hero, empty-state hero — never inside the reader            |
| `type-display-lg`  | `clamp(28px, 2vw + 14px, 36px)` / 1.1 / `-0.02em`   | 600    | Page hero titles, chapter-transition card                              |
| `type-title`       | 24px / 1.2 / `-0.015em`                             | 600    | `CardTitle`, dialog and sheet titles (today `text-2xl tracking-tight`) |
| `type-heading`     | 18px / 1.3 / `-0.01em`                              | 600    | Section headings, manga detail title                                   |
| `type-body`        | 14px / 1.55 / `-0.011em`                            | 400    | Default body copy (`text-sm`, the components' convention)              |
| `type-body-lg`     | 16px / 1.5 / `-0.011em`                             | 400    | Reader descriptions, alert titles                                      |
| `type-label`       | 14px / 1 / `-0.006em`                               | 500    | Buttons, tab triggers, form labels                                     |
| `type-meta`        | 12px / 1.4                                          | 400    | Provider IDs, page counters, timestamps                                |
| `type-micro`       | 11px / 1.2 / `0.02em`                               | 500    | Glass chips and keyboard hints (proposed: 10px today)                  |
| `type-code`        | 12–13px / 1.5                                       | 400    | Logs, extension IDs, checksums, diagnostics (mono)                     |

Command-palette group headers stay `text-xs font-semibold uppercase tracking-wide` (existing).

**Spacing of type.** Headers sit in a `space-y-1.5` / `gap-2` stack with their description; page headers
use `gap-4` before their action row; settings sections separate title from body with `pb-4` and a closing
separator at `mt-4`.

## 5. Motion Language

All motion ships through `@app/motion`. No component imports GSAP directly, no component hand-rolls a
CSS keyframe for something the package owns, and every helper takes `reducedMotion` and resolves to the
end state when it is true.

> **Naming note, read this once:** `expo.out` is **GSAP's exponential ease-out** (`EASING.emphasizedOut`).
> It has nothing to do with the Expo framework, which this repository no longer uses. Write it as
> `expo.out` in GSAP code and never "expo" in prose.

### 5.1 Duration scale (existing — `packages/motion/src/tokens/duration.ts`)

| Token                 | ms  | Use                                                            |
| --------------------- | --- | -------------------------------------------------------------- |
| `DURATION.instant`    | 0   | Reduced motion; state changes that must not animate            |
| `DURATION.micro`      | 90  | Press feedback, chrome hide, tiny affordances                  |
| `DURATION.quick`      | 140 | Hover, focus, chrome show, small transitions, route exit       |
| `DURATION.standard`   | 220 | Panels, cards, sheet close, route enter, command-palette panel |
| `DURATION.expressive` | 360 | Sheet open, onboarding, empty states, route continuity         |
| `DURATION.cinematic`  | 520 | Rare hero moments and the reader's page turn — never in a loop |

### 5.2 Easing presets (existing — `packages/motion/src/tokens/easing.ts`)

| Token                  | GSAP value      | Use                                                             |
| ---------------------- | --------------- | --------------------------------------------------------------- |
| `EASING.standardOut`   | `power2.out`    | Standard exits, chrome hide, sheet close                        |
| `EASING.standardInOut` | `power3.inOut`  | State changes, the reader page turn                             |
| `EASING.emphasizedOut` | **`expo.out`**  | Emphasis and glass settle: chrome show, sheet open, panel enter |
| `EASING.softEntrance`  | `power1.out`    | Soft entrances, chrome show                                     |
| `EASING.snapFeedback`  | `back.out(1.2)` | Snap feedback (toggles, chips) — capped at `quick`              |
| `EASING.scrollLinked`  | `none`          | Scrubbed or container-driven motion only                        |

**Proposed additions** for the liquid feel, in the same file plus the matching CSS custom properties so
tw-animate-css and GSAP agree on the curve:

- `EASING.liquidSettle` = `CustomEase.create('liquidSettle', 'M0,0 C0.16,1 0.3,1 1,1')` ↔ CSS
  `--ease-liquid: cubic-bezier(0.16, 1, 0.3, 1)`. The damped, quickly-settling curve for glass
  entrances, sheet open, hover lift and press release.
- `EASING.glide` = `CustomEase.create('glide', 'M0,0 C0.32,0.72 0,1 1,1')` ↔ CSS
  `--ease-glide: cubic-bezier(0.32, 0.72, 0, 1)`. The iOS-style sheet/drawer curve.
- A true spring (`elastic`/physics) is **not** part of the language: it overshoots, and an overshooting
  glass surface reads as plastic. Damped settle is the house feel.

### 5.3 Interaction states

| State                       | Motion                                                                                                  | Notes                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Press                       | `scale: 0.97`, `DURATION.micro`, `power2.out`                                                           | Release returns at `DURATION.standard` / `expo.out` (damped settle). Proposed helper `pressFeedback()` in `@app/motion` |
| Hover (pointer only)        | `y: -1px`, one elevation step up (cards 1 → 3, floating controls 2 → 3), `DURATION.quick`, `power2.out` | Only under `@media (hover: hover) and (pointer: fine)`; never the only affordance                                       |
| Focus                       | **none**                                                                                                | The 2px `--ring` at 2px offset appears instantly. Focus is never animated, never delayed, never faded                   |
| Selected / active           | fill + specular edge change, `DURATION.quick`                                                           | Colour transitions may use CSS; geometry must not move                                                                  |
| Disabled                    | no motion, 50% opacity                                                                                  |                                                                                                                         |
| Glass appear                | `opacity` + `transform` of the whole layer, `DURATION.quick`–`standard`                                 | Never animate `backdrop-filter` or `box-shadow`                                                                         |
| Glass settle (after a drag) | `expo.out`, `DURATION.standard`                                                                         | The layer arrives and stops; no bounce                                                                                  |

### 5.4 Sheets, pages and the reader

- **Sheets/drawers** (existing `settingsDrawerTransition`): open `DURATION.expressive` with
  `emphasizedOut` (`expo.out`); close `DURATION.standard` with `standardOut`. Target: the CSS side uses
  `--ease-glide` so the Radix/tw-animate-css path and the GSAP path are the same curve.
- **Command palette** (existing): backdrop `DURATION.quick`, panel `DURATION.standard` with
  `emphasizedOut` from `y: -8, scale: 0.98`.
- **Route transitions** (existing `routeEnter`/`routeExit`): default enter `standard` / exit `quick` at
  `y: 8`; the reader variant enter `quick` / exit `micro` at `y: 4`. Reader routes always use the reader
  variant — the reader must feel instant.
- **Reader chrome** (existing `chromeShow`/`chromeHide`): show `DURATION.quick` from `y: -8` with
  `power1.out`; hide `DURATION.micro` with `power2.out`.
- **Reader page transition** (existing `pageTurn`): the page layer alone moves, `xPercent ±100`,
  `DURATION.cinematic` with `power3.inOut`, and only in paged modes. The safe-transition contract:
  1. Only the page layer animates. Tap-zone geometry, chrome insets and the zoom layer never move during
     the transition, so a tap mid-transition still hits the zone it hit before.
  2. `transform` and `opacity` only. No blur, no filter, no layout property, no `ScrollTrigger`.
  3. The transition never blocks navigation, zoom, pan or preloading; a second navigation request wins
     immediately and cancels the tween.
  4. Reduced motion replaces the tween with a `gsap.set()` to the end state — an instant page change,
     never a slow crossfade.
  5. No transition in continuous scroll/webtoon mode; the strip's own scrolling is the motion.
- **Chapter transition card**: the only place `type-display-lg` and the displacement refraction variant
  may appear in the reader. Entrance `expressive`, `expo.out`; it must be dismissible instantly.

### 5.5 Reduced motion & reduced transparency contract

- **Reduced motion** (`prefers-reduced-motion: reduce`, read by `useReducedMotion()` /
  `getReducedMotionPreference()`): every helper resolves to its end state via `gsap.set()`; the CSS side
  collapses tw-animate-css durations to `0.01ms`; the ambient backdrop, parallax, scrubbed and looping
  motion are off entirely; the reader keeps instant page changes. Motion is never _removed_ in a way that
  hides state — a sheet still opens, it just appears.
- **Reduced transparency** (§2.5): every glass tier resolves to its opaque equivalent, the ambient
  backdrop is off, the specular edge and elevation stay. The reader stage keeps a 0.88 black plate, so
  white chrome type stays legible without a blur.
- **`prefers-contrast: more` (proposed):** raise glass fills to their opaque tokens, thicken the focus
  ring to 3px, and keep every hairline at full `--border` strength.
- **In-app settings:** appearance settings has a **Motion** (Full / Reduced) and a **Transparency**
  (Full / Reduced) control, both defaulting to Full. Reduced wins if **either** the OS query or the
  in-app setting asks for it (OR semantics); the setting can therefore add motion reduction but cannot
  override a reduced OS preference back to Full. `docs/Design.md` already promises a motion-intensity
  setting; this is it.

### 5.6 GSAP usage conventions (existing, binding)

- Register plugins once in `@app/motion` (`registerGsapPlugins`), never in a component.
- React components use `useGSAP()` from `@gsap/react` with a scope ref, or an equivalent
  `gsap.context()` cleanup.
- Wrap delayed/event-created animation callbacks with `contextSafe()` or a package helper.
- Use timelines for coordinated sequences instead of chained delays; use `autoAlpha` when a hidden
  element must not be interactive; use transform aliases (`x`, `y`, `scale`, `xPercent`, `yPercent`).
- Never run GSAP during SSR; never leave a ScrollTrigger unkilled; no markers in production.
- ScrollTrigger stays out of core reader scrolling, per `docs/Design.md`.

## 6. Device Adaptation & Accessibility

Two contracts, both first-class. Touch is designed for a thumb on glass; pointer+keyboard is designed for
precision and speed. Feature parity is required, identical layouts are not.

### 6.1 Touch contract (mobile & tablet)

Gesture thresholds are the shipped constants in `packages/reader/src/gestures.ts` and
`tap-zones.ts` — quoted here so no one re-invents them:

| Gesture    | Threshold                                                                                                                                                     | Source         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Pan vs tap | pointer travel **> 6px** (`PAN_THRESHOLD_PX`) is a pan, not a tap                                                                                             | `gestures.ts`  |
| Double tap | two taps within **300ms** and **30px** (`DOUBLE_TAP_MS`, `DOUBLE_TAP_SLOP_PX`)                                                                                | `gestures.ts`  |
| Pinch      | two pointers; `scale = baseline.scale × (distance / baseline.distance)`                                                                                       | `gestures.ts`  |
| Tap zones  | left/right thirds navigate, centre third toggles chrome; zones are clipped by the chrome insets (`top: 96`, `bottom: 48`) and disabled while `zoom.scale > 1` | `tap-zones.ts` |

Rules: a visible control always wins over a tap zone — zones are computed around the chrome, never under
it. Zones never change geometry during an interaction (no zone shift while chrome animates). Zoom, pan,
scroll and tap always outrank animation. Hit targets are ≥ 44×44 CSS px for primary controls (≥ 24×24
absolute minimum, WCAG 2.2 AA) with ≥ 8px between adjacent targets. **Existing:** `touch-action: none` on
the zoom layer and on the progress rail's track (a scrub must not scroll the page), and
`overscroll-behavior: contain` on the reader's scroll strip. **Proposed:** `touch-action: pan-y` on the
shell's scroll surfaces, and `overscroll-behavior: contain` on sheets and dialogs — neither ships today
(the sheet has no overscroll rule at all).

**Proposed additions:** drag-to-dismiss for bottom sheets when the drag passes **120px** or velocity
exceeds **0.5 px/ms**, with a damped settle back at `expo.out`; long-press (500ms) on a manga card opens
the action sheet, with a haptic-equivalent visual pulse at 90ms. Nothing else is added to the reader's
gesture set.

### 6.2 Pointer + keyboard contract (desktop)

- **Hover** exists only under `@media (hover: hover) and (pointer: fine)`, and is never the only
  affordance: every hover state has a focus and a pressed equivalent.
- **Focus**: a 2px `--ring` at 2px offset on `:focus-visible`, identical on every variant, never
  obscured by sticky chrome (the shell reserves scroll padding for the sticky header and bottom bar).
- **Shortcuts** (existing): `Cmd/Ctrl+B` toggles the rail; `Cmd/Ctrl+K` opens the command palette; the
  reader answers `ArrowLeft`/`ArrowRight` (direction-aware, inverted by reading mode), `ArrowUp`/
  `ArrowDown`, `PageUp`/`PageDown`, `Home`, `End` and `Space`. Every shortcut shown in the UI is a real
  shortcut — the rail's footer hint and the palette rows are the contract.
- **Wheel**: `Ctrl/Cmd + wheel` zooms when the reader's wheel behaviour is `zoom`, otherwise the wheel
  scrolls; the reader's wheel handler is non-passive so it can cancel browser zoom.
- **Pointer affordances on glass**: a hovered glass control raises from elevation 2 → 3 and brightens its
  specular edge — never a colour-only change.

### 6.3 Breakpoints

| Range                  | Shell                                                                                        | Reader                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `< 768px` (below `md`) | Bottom bar (glass-thick, 4 destinations + a "More" sheet), content reserves `pb-16`; no rail | Single page; chrome top bar + bottom rail; tap zones on; dense chrome (icons only)                |
| `768–1023px`           | Rail collapsed to 52px icons, expandable; floating over the ambient band                     | Single page, or double when `pageLayout = double` and the page is landscape; chrome labels appear |
| `≥ 1024px`             | Persistent rail, 220px expanded / 52px collapsed (`Cmd/Ctrl+B`), glass-thick, elevation-4    | Double-page layout honoured; preview rail on the progress bar; keyboard-first                     |

Grids keep their existing rhythm (library 2 → 3 → 4 → 5 → 6 columns, discover 2 → 3 → 4 → 6, `gap-4`).
The glass budget is per view, not per breakpoint (§2.5): a view shows 1–2 blurred layers in normal use
and 4 at most, when a sheet or the command palette is open. The table is the target contract: today the
rail is hidden below `md` with a hover-expand and the bottom bar is the only sub-`md` navigation (§7.7).

### 6.4 Accessibility contract

- **Baseline:** WCAG 2.2 AA, including 1.4.11 (non-text contrast) and 2.5.8 (target size, 24×24 min).
- **Contrast:** text and icons meet the floors in §3.5; glass never carries text without the placement
  rule that makes it pass; status is never colour-only.
- **Focus visibility:** always visible, never animated, never clipped by sticky chrome, ring contrast
  ≥ 3:1 against the surface it sits on (the P1 `--ring` fix, §3.3).
- **Reduced motion / transparency:** both are honoured from the OS _and_ overridable in-app (§5.5);
  neither may hide state.
- **Semantics:** the reader chrome is a labelled `toolbar` with labelled buttons; the progress rail is a
  slider with `aria-valuetext`; the tap surface exposes no phantom controls to assistive tech; refraction,
  sheen and ambient layers are `aria-hidden` and non-interactive; sheets and dialogs trap focus, have
  accessible titles, close on Escape, and return focus to their trigger; icon-only controls always carry
  an accessible name.
- **Keyboard:** every flow — shell, reader, palette, dialogs, settings, extensions — is completable
  without a pointer, and focus order follows visual order.
- **Motion safety:** no flashing above 3Hz, no autoplaying motion over page content, no infinite ambient
  loops near the reader.

## 7. Component Stylings

Every recipe below is written for the shadcn conventions the repository already uses: `cva`-style variant
maps, semantic tokens only (no raw colours), `cn()` composition, and no styling logic in feature code.
New variants are named so an implementer can add them without inventing names. A variant map carries the
button base classes inside every value (the shadcn `cva` base list, adopted in #84), so a new variant must
include that base string — composing a variant without it drops `inline-flex items-center` and stacks the
icon above the label.

### 7.1 New primitives for `@app/design-system` (landed in P1)

| Primitive         | API (shipped)                                                                                                                                         | Purpose                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GlassSurface`    | `level: 'thin' \| 'regular' \| 'thick' \| 'stage'`, `tone: 'default' \| 'raised' \| 'reader'`, `elevation?: 0–4`, `edge?: boolean`, `plate?: boolean` | The single source of the glass-tier material: fill, `backdrop-filter`, edge, specular, inner shadow, elevation. Modal scrims use the separate `glass-scrim` utility |
| `RefractionLayer` | `variant: 'sheen'`, `edge?: boolean`, `aria-hidden` by default                                                                                        | The decorative light layer from §2.2. Displacement is opt-in and not shipped in P1                                                                                  |
| `GlassPanel`      | `GlassSurface` + `padding: 'none' \| 'sm' \| 'md' \| 'lg'`                                                                                            | The replacement for the `.surface-panel` utility in shell and feature code                                                                                          |
| `AmbientBackdrop` | none (fixed, decorative)                                                                                                                              | The §2.3 band, rendered once by the app shell                                                                                                                       |

`GlassSurface` is the only place `--glass-*` tokens are read, and it refuses to render two
imagery-blurring tiers nested (§2.5). `surface-panel` is kept as a deprecated alias that renders a matte
`GlassPanel` until every caller has moved (P5). `asChild` is not shipped in P1: `@radix-ui/react-slot`
is not a dependency of the package, so `GlassPanel` renders a `div` and forwards every prop.

### 7.2 Buttons (`packages/design-system/src/components/ui/button-variants.ts`)

- **Shape:** gently squared — 8px (`--radius-btn`); `sm` tightens to 7px (`--radius-control`) to match the
  inputs beside it. Never pill, never square.
- **Sizes (existing):** default `h-10 px-4 py-2`, `sm` `h-9 px-3`, `lg` `h-11 px-8`, `icon` `h-10 w-10`.
  Touch surfaces use the 44px `lg` size, or an `icon` control given ≥ 44×44 of hit area, where practical.
- **Variants (existing):** `default` ink fill with 90% hover, `destructive`, `outline` (1px `--border` on
  the canvas, `--accent` hover), `secondary` (80% hover), `ghost` (no chrome until hover), `link`.
- **Focus:** 2px `--ring`, 2px offset, identical everywhere. **Disabled:** 50% opacity, no pointer events.
- **New variant `glass` (proposed):** `GlassSurface level="thin"` + `--glass-edge` + `type-label`, for
  controls that float over content (shelf "add" buttons, reader chips). Hover raises the fill one tier
  (`thin` → `regular`) and the elevation one step; press uses `pressFeedback()`.
- **Reader chrome buttons** stay `ghost` with `text-white hover:bg-white/20` but move onto a stage plate
  (§3.5) so their hover wash always sits on a known backdrop.

### 7.3 Cards & surfaces

- **Matte card (existing):** `--radius-box` (10px), 1px `--border`, `--card`, `shadow-sm`, `p-6`, internal
  `space-y-1.5`.
- **Target card (proposed):** `GlassSurface level="regular"` over the ambient band, `--radius-glass`
  (14px), `--glass-edge`, `--elevation-1`, `p-6`. Over imagery (manga covers) the card is `thick` and its
  cover area sits on a plate so the title stays ≥ 4.5:1 (§3.5).
- **Hover** (interactive cards only): elevation 1 → 3, `y: -2px`, `scale: 1.02`, `DURATION.standard` with
  `expo.out`. Static panels never animate.
- **Manga card (existing structure, glass target):** 3:4 portrait button; grid variant stacks a
  full-bleed cover (7px corners) with the title in a bottom overlay (`absolute bottom-0 left-0 right-0
  p-3`) that carries **no** plate today — the bottom plate is the §3.5 proposal, not a current fact;
  list variant is a `gap-4 p-3` row with an 80×56 cover; compact is `gap-3 p-2` with a 64×48 cover.
  Provider ID at `type-meta`; up to three tags as outline badges at `type-micro`; a content rating above
  `safe` plants a destructive badge with text, never colour alone. Cards must not depend on hover on
  touch.
- **`.surface-panel` (existing):** `--surface`, 1px `--border`, 10px corners, `0 1px 2px rgb(0 0 0 / .04)`
  (dark: `0 1px 2px rgb(0 0 0 / .35)` plus `inset 0 1px 0 rgb(255 255 255 / .03)`). Target: `GlassPanel`
  at `level="regular"`; the matte recipe survives as the low-end/reduced-transparency resolution.

### 7.4 Sheets, dialogs, popovers & the command palette

- **Dialogs (P5 #94 shipped):** `max-w-lg`, `GlassSurface level="thick"`, `--radius-glass`,
  `--elevation-4`, and the shared `glass-scrim` utility (`rgb(0 0 0 / .55)` with `blur(8px)`) — the
  scrim is what keeps the dialog's own contrast safe over busy content.
- **Sheets (P5 #94 shipped):** slide from the right by default (`w-3/4 max-w-sm`), or full-width; open
  300ms / close 200ms. The default panel uses `GlassSurface level="thick"`, `--radius-glass` on its
  leading edge, elevation-4, and the shared `glass-scrim`. The reader's `surface="glass"` path keeps its
  transparent popup over its own GlassSurface. `--ease-glide`, expressive/standard durations and the
  proposed drag-to-dismiss (§6.1) remain deferred.
- **Popovers, selects, tooltips (existing):** `--popover` + `shadow-md`. A tooltip is a hidden bubble
  revealed on hover or focus, positioned beside its trigger — not a permanent wrapper box. Target:
  `GlassSurface level="regular"`, `--elevation-3`; a tooltip is `level="thick"` so its text never fights
  the backdrop.
- **Command palette (P5 #94 shipped):** `max-w-xl`, 12vh from the top, `h-11` borderless search field,
  `text-xs uppercase tracking-wide` group headers, rows hovering on `--muted` at 70% and taking `--accent`
  with a hairline ring when selected. Its panel uses `GlassSurface level="thick"` with `--elevation-4`
  and its backdrop uses the shared `glass-scrim` (`rgb(0 0 0 / .55)` + `blur(8px)`). The selected row's
  left accent bar (not colour alone) remains deferred.

### 7.5 Inputs & forms

- **Stroke (existing):** 1px `--border` (`--input` shares the value), `--background` fill, 7px corners,
  `h-10`, `px-3 py-2`, `text-sm`. Selects match exactly.
- **Placeholder:** `--muted-foreground`, visible, never a ghost. On glass, use
  `--glass-muted-foreground`.
- **Focus:** 2px `--ring` at 2px offset. **Labels:** `type-label`, immediately above the control, dimming
  with the field when disabled.
- **Switch (existing):** 24×44 pill (`--radius-badge`) with a 20px circular thumb carrying `shadow-md`.
- **Slider (existing):** native range with a transparent track and a 16px `--primary` thumb. The reader's
  page rail is the same idea on the stage: an 8px white-at-25% track, a 16px white thumb (positioned by
  `left`), and a fill that scales by `transform` only over a raw 180ms `cubic-bezier(0.22, 1, 0.36, 1)` (a CSS transition
  in `reader-progress-rail.tsx`, not a `DURATION` token), with the preview popover at 120ms `ease-out`.
- **Tabs (existing):** a 40px trough at 7px radius on `--muted`, active trigger on the canvas colour with
  `shadow-sm` — the only place a tab looks raised. Target: the trough becomes `GlassSurface
  level="thin"` inside glass panels, with the active trigger on `--surface` and a specular edge.

### 7.6 Reader chrome (the priority surface)

Structure is unchanged: a fixed top bar (chapter title, mode pill, settings, fullscreen), a fixed bottom
rail (prev/next, page counter, progress rail with page previews), `CHROME_INSETS { top: 96, bottom: 48 }`,
and `chromeShow`/`chromeHide` from `@app/motion`. The material is what changes:

- The container moves from `bg-gradient-to-b from-black/80 to-transparent` to `GlassSurface
  level="stage"` at alpha **0.78**, keeping the gradient as a _supplement_ (`from-black/85
  via-black/60 to-transparent`) rather than the only protection — the gradient's tail has no contrast
  value, which is exactly where the old chrome was weakest.
- Every control row sits on a stage **plate** (§3.5) so `text-white/70` labels hold ≥ 4.5:1 over a white
  page (measured 5.59:1 at 0.78).
- The mode pill (`rounded-full bg-white/10 p-1` with a `bg-white` thumb) becomes `GlassSurface
  level="thin"` over the stage with `--glass-specular` on the active thumb; the morph keeps today's
  timing — **280ms, `power3.out`** (a raw literal in `reader-chrome.tsx`, not a `DURATION` token; P3 may
  tokenise it) — and is skipped under reduced motion.
- The progress rail keeps its 8px `bg-white/25` track and 16px white thumb, gains a stage plate under the
  preview popover (`border-white/20 bg-black/80` today → `GlassSurface level="stage"`), and keeps
  `focus-visible:ring-2 ring-white/70`.
- Reader modals (settings sheet, chapter transition card) are the only places `level="thick"` /
  displacement refraction may appear inside the reader.
- The offline toast (`rounded-full bg-black/80 px-3 py-1 text-xs text-white`) becomes
  `GlassSurface level="stage" tone="reader"` — same geometry, better material.

### 7.7 Sidebar / shell

- **Desktop rail (existing):** 220px expanded / 52px collapsed over a 200ms ease-out transition, hidden
  below `md`, on `--sidebar` with a right hairline, rows 36px (`h-9`) at `text-sm font-medium` with 16px
  icons (the button base's `[&_svg]:size-4`, which every `buttonVariants` value carries) in a `gap-1` list,
  active row on the secondary fill, hover on `--accent`, and a foot holding the
  collapse control plus a mono `kbd` hint on `--sidebar-accent`. Hovering the rail expands it on pointer
  devices after a 200ms delay, and the toggle button gives keyboard and touch users the same state. Target:
  `GlassSurface level="thick"` floating with `--radius-glass` and `--elevation-4`; the active row takes
  `--accent` **plus** a 2px `--primary` edge bar.
- **Mobile bottom bar (P5 #94 shipped):** 56px, `GlassSurface level="thick"` with `--glass-edge` and
  `--elevation-4`, safe-area inset, four destinations with 20px icons and `type-micro` labels, active in
  `--primary`, plus a ghost "More" sheet; content reserves `pb-16`.
- **Page header / sticky bars (proposed):** a sticky `GlassSurface level="regular"` header on long
  surfaces, elevation-2 once scrolled, with the title at `type-title`.

### 7.8 Empty, loading and error states

- **Empty (existing):** a 48px muted icon at 50% opacity, a `type-heading` title, a `max-w-sm type-body`
  muted explanation, one primary action at `mt-6`. Target: the whole block sits on
  `GlassSurface level="regular"` when it floats over content; the icon may use the displacement
  refraction variant outside the reader.
- **Loading (existing):** skeletons follow the real column rhythm (2 → 3 → 4 → 5) so nothing shifts when
  content lands. Target: skeleton fills use `--muted` on matte and `--glass-thin` shimmer on glass; never
  animate a blurred layer.
- **Error (existing):** the panel recipe at `max-w-lg p-6` with a borderless destructive alert inside;
  errors are specific, recoverable and attributed to their provider. Target: `GlassSurface
  level="thick"`, destructive text on `--destructive-glass` (§3.4), retry as the primary action.

## 8. Layout Principles

### Shell

A full-height flex row: navigation rail, scrolling main column; the reader route opts out into
`fixed inset-0` with no global navigation. Below `md` the rail is replaced by the bottom bar and the main
column gains `pb-16`. The ambient band (§2.3) sits behind the whole shell, fixed, and never scrolls.

### Page structure

- Browsing pages (library, discover): `max-w-[1600px]` centred, `p-6` rising to `p-8` on desktop,
  `gap-6` between header, filters and grid.
- Text-heavy pages (settings, diagnostics): `max-w-3xl p-6`; theme customisation `max-w-5xl` with
  `space-y-8`.
- Detail pages: a 160px cover (192px from `md`) beside the metadata, description capped at `max-w-3xl`;
  chapter lists stay a single bordered, divider-separated block.
- Page headers: title, count badge and description left; actions right; stacking below `sm`.

### Grids

Library 2 → 3 → 4 → 5 → 6 columns at `gap-4` (list mode `grid-cols-1 gap-2 sm:grid-cols-2
lg:grid-cols-3`); discover 2 → 3 → 4 → 6; extensions and theme previews 1 → 2 → 3 at `gap-4`/`gap-6`.
Long grids are virtualised; skeletons mirror the column rhythm so layout never shifts.

### Whitespace & rhythm

Page padding 24px mobile / 32px desktop; internal stacks `gap-4`/`gap-6`; card interiors 24px; settings
sections separated by a 16px `mt-4` divider. Whitespace separates first, hairlines second, elevation
third — the target adds glass as the fourth tool, and it is the only one that costs frames, so it is used
where context matters (chrome, floating layers) and nowhere else. Reader chrome floats with `px-4 py-3`
(top) and `px-4 py-2` (rail) — dense enough to stay out of the way, never overlapping tap zones.

## 9. Do's and Don'ts

**Do**

- Do start from `GlassSurface` for anything translucent, and pick a tier from §2.1 instead of choosing a
  blur radius.
- Do give glass something to refract: the ambient band in the shell, page art in the reader, cover art in
  the grid.
- Do put a plate under text that sits over imagery, and verify the pair over both a white and a black
  backdrop.
- Do keep the page and its art untouched in the reader: chrome floats, content never moves.
- Do route every animation through `@app/motion`, pass `reducedMotion`, and use `expo.out` (GSAP's
  exponential ease-out) for anything that should feel like glass settling.
- Do keep the reader at one blurred layer while reading (never more than four, and only with a sheet open)
  and the shell at four, at most (§2.5).
- Do keep focus instant, visible and unobscured, and keep every target ≥ 44×44 on touch.
- Do let a theme repaint colours while the material, radii, elevation and behaviour stay fixed.
- Do check `docs/Design.md` before shipping a screen — it holds the binding rules this document values.

**Don't**

- Don't hand-write `backdrop-blur-*`, `bg-white/10` or `bg-black/80` in a component; that is how the
  material drifts.
- Don't put `backdrop-filter` on a scrolling surface, on a nested glass layer, or animate its blur radius.
- Don't use `--muted-foreground`, `--border`, or a translucent white/black for text or hairlines on glass.
- Don't carry text on thin glass over imagery, and don't carry any glass text without a verified contrast
  pair.
- Don't add a shadow that is not one of the four elevation steps, and don't use elevation where a
  hairline or whitespace does the job.
- Don't animate focus, layout properties, or anything in the reader that moves a tap zone.
- Don't add ambient or looping motion near page content, and don't ship a ScrollTrigger over reader
  scroll.
- Don't invent a fifth glass tier, a second display face, or a colour outside the token set.
- Don't treat `prefers-reduced-motion` as the only fallback: transparency, blur support and low-end
  devices each have their own path (§2.5).
- Don't let the reader depend on a blur to be legible — the opaque stage plate is the floor.

## 10. Iteration Guide

1. Read this file's frontmatter, Do's/Don'ts and §12 before changing anything.
2. A new value starts as **proposed** here, with a name, a tier or a step it belongs to, and a contrast
   or cost note. Nothing enters the code as a one-off class.
3. Introduce tokens in `packages/design-system/src/styles/globals.css` (`:root, .light` and `.dark`) and
   register them in `@theme inline`; expose behaviour through a primitive or a `cva` variant, never as
   free classes in a feature.
4. Add the motion side in `packages/motion` (token + helper + `reducedMotion` path + a test).
5. Prove it in the design-system page (`apps/web/app/design-system`, §13 P7) over a light and a dark
   backdrop, at 375px and 1280px, with reduced motion and reduced transparency toggled.
6. Update this file and `docs/Design.md` in the same PR that changes the system — a stale design doc is a
   contradiction waiting to happen.
7. Consuming this file with the shadcn workflow: read the frontmatter, map the roles to shadcn variables
   (§3.8), pin the radius scale and the shadow scale in `@theme`, restyle the `cva` variants, build the
   design-system page, then verify (typecheck, no console errors, no horizontal overflow at 375/1280,
   dark mode toggled). Report every deliberate deviation from this file.

## 11. Current State — what exists today vs what is new

Honest accounting. Nothing below is aspirational; §13 is where the gap closes.

**Exists today**

- **Tokens:** 29 semantic custom properties in `:root, .light` and `.dark` (background, foreground,
  muted, muted-foreground, surface, surface-raised, popover, card, border, input, primary, secondary,
  accent, destructive, success, warning, ring, reader-background, sidebar family), four radii
  (`--radius-box` 10px, `--radius-control` 7px, `--radius-btn` 8px, `--radius-badge` 9999px), three font
  stacks, and the `.surface-panel` recipe with its dark-mode inset highlight.
- **Glass material (landed in P1):** the four tier fills plus `--glass-edge`, `--glass-specular`,
  `--glass-inner`, `--glass-sheen`, `--glass-plate`, `--glass-muted-foreground`, `--ambient-1/2`,
  `--radius-glass` (14px) and the four `--elevation-*` steps, registered in `@theme inline` /
  `@theme` (the shadow tokens). The tier utilities (`glass-thin`, `glass-regular`, `glass-thick`,
  `glass-stage`), the refraction/plate/ambient utilities and the §2.5 resolution paths (cheap profile,
  `data-transparency="solid"`, `@supports`, `prefers-reduced-transparency`) live in
  `globals.css`; `GlassSurface`, `RefractionLayer`, `GlassPanel`, `AmbientBackdrop` and
  `resolveGlassProfile()` are exported from `@app/design-system`.
- **Theme layer:** `packages/theme` repaints 27 of those 29 variables across 10 presets
  (`default`/Minimal first); `--surface` and `--surface-raised` are not repainted, and not every repainted
  value comes from a preset token (`--muted-foreground` is hardcoded in `apply-theme.ts`).
- **Components:** 16 `ui/*` primitives (button, card, dialog, sheet, command, badge, skeleton, input,
  label, switch, select, slider, tabs, alert, separator, tooltip) plus PageHeader, MangaCard,
  ReaderChrome, ReaderProgressRail, SettingsSection, ThemePreview, EmptyState, LoadingState, ErrorState.
- **Glass gestures (the direction, unbuilt):** the reader chrome is a black gradient
  (`from-black/80 to-transparent`) with `bg-white/10`/`bg-white/20` controls and white type; the progress
  rail is `bg-white/25` with a white thumb; the mobile bottom bar is `bg-background/95 backdrop-blur`; the
  sheet overlay is `bg-black/60 backdrop-blur-sm`; the command-palette scrim is
  `bg-black/55 backdrop-blur-[2px]`. That is five ad-hoc translucencies with no shared tier, no
  saturation, no edge light and no fallback.
- **Motion:** `DURATION` (6 steps) and `EASING` (6 presets, including the GSAP `expo.out`), helpers
  (`fadeIn`/`fadeOut`, `slideUp`/`slideDown`, `scaleIn`, `staggerIn`, `createTimeline`), reader-safe
  helpers (`chromeShow`/`chromeHide`, `pageTurn`, `settingsDrawerTransition`), route transitions, command
  palette and grid-stagger motion, `useReducedMotion`/`getReducedMotionPreference`, all with tests.
- **Reader behaviour:** gesture thresholds, tap zones, zoom, keyboard navigation, preloading and progress
  persistence, all as pure modules with tests.

**Not built yet (the rest of §13)**

- The glass `cva` variants on the existing components and the `.surface-panel` deprecation (P5).
- The displacement-refraction opt-in (P1 ships the layered recipe only).
- The `data-glass` / `data-transparency` attributes applied by the shell, the in-app Motion and
  Transparency settings, and the `prefers-contrast` handling (P4/P5).
- `--glass-muted-foreground` and the glass status colours are tokens; **no consumer uses them yet**.
- `--radius-glass` is used by `GlassSurface`; the `type-*` utilities, the 11px glass micro-label,
  `EASE.liquidSettle` / `glide` (`--ease-liquid`, `--ease-glide`) and the `pressFeedback()` helper (P3).
- The drag-to-dismiss and long-press gestures, and the design-system page (P7).

## 12. Known Gaps & Open Questions

- **Focus ring contrast (fixed in P1).** `--ring` measured 2.32:1 (light) and 2.58:1 (dark) against the
  canvas, under WCAG 2.2's 3:1 for non-text contrast. The fix in §3.3 shipped: light `#78716c`
  (4.41:1), dark `#a8a29e` (7.80:1), pinned by the design-system's token-contrast test and the
  theme layer's per-preset ring test.
- **Light-mode `--warning` on glass (3.10:1) and the shipped `--success` `#16a34a` (3.21:1; the proposed
  `#15803d` reaches 4.89:1), measured against the light glass
  fill (regular, alpha .68) over `--background`.** The glass status colours in §3.4 are proposals, not
  measurements of shipped values.
- **`prefers-reduced-transparency` support is uneven.** The CSS resolution path ships in P1; the in-app
  setting is the reliable path and is P4/P5. Verify the media query in the design-system page (P7).
- **Displacement refraction has no budget number yet.** It is capped to two hero surfaces by rule; measure
  the frame cost on a low-end profile before allowing a third.
- **No webfonts are bundled.** Inter and JetBrains Mono are stacks today; the display scale assumes Inter.
  Bundling is a separate decision (licensing, weight, first-paint cost) and is not part of this rebuild.
- **Theme presets and glass.** Presets may tint the glass fills, but no preset has been designed for the
  glass tiers yet. Until P5, presets keep their current tokens and glass uses the default tier values.
- **The reader's top-bar gradient has no protected tail.** The plate rule (§3.5) fixes it for control rows;
  whether the gradient itself should be replaced outright is an open question for P2.
- **`docs/design-direction.md` is unused.** The target language and the roadmap live here; a separate
  direction note would only duplicate it.

## 13. Implementation Roadmap

Ordered, PR-sized, reader-first: P1 is the material foundation the reader needs, P2 is the reader chrome,
P4 is the shell, and the rest follow. Every step names the packages it touches and the tests it owes; every
step runs the repository gates (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm run doctor`,
`pnpm knip`).

**P1 — Material tokens, fallbacks and the glass primitive** (`packages/design-system`, plus
`packages/theme` for the ring fix) — **landed.**
Shipped: `--glass-thin/regular/thick/stage`, `--glass-edge`, `--glass-specular`, `--glass-inner`,
`--glass-sheen`, `--glass-plate`, `--glass-muted-foreground`, `--radius-glass`, `--ambient-1/2`, the
elevation scale and the `@theme` / `@theme inline` registrations; the `@supports`,
`data-glass="cheap"` / `data-transparency="solid"` and `prefers-reduced-transparency` resolution paths
plus `resolveGlassProfile()`; `GlassSurface`, `GlassPanel`, `RefractionLayer` (`sheen`, plus the opt-in displacement added later) and
`AmbientBackdrop`; the `--ring` fix. Tests: token-resolution and contrast tests
(`glass-tokens.test.ts`), primitive/aria-hidden/budget tests (`glass.test.tsx`), the per-preset ring
invariant in `packages/theme`. No consumer changes in this PR. Not shipped here: the displacement
refraction variant, `asChild`, the ambient entrance animation and the in-app Transparency setting
(P4/P5/P7).

**P2 — Reader chrome on stage glass** (`packages/design-system`, `packages/reader`)
Move `ReaderChrome` and `ReaderProgressRail` onto `GlassSurface level="stage"` with plates under the
control rows, keep `CHROME_INSETS`, tap zones and keyboard behaviour byte-for-byte, keep the mode pill's
morph timing (280ms `power3.out`, §7.6), and switch the offline toast and the preview popover to stage
glass. Tests: the existing reader-chrome a11y test stays green, plus new tests for the plate geometry (a
control row never leaves the plate), the reduced-transparency resolution, and a tap-zone test proving
chrome and sheet interactions still cannot reach the tap surface.
**Status:** landed (#102); the settings-sheet scrim moved to the shared `glass-scrim` in P5.

**P3 — Liquid motion** (`packages/motion`, `packages/design-system`)
Add `EASING.liquidSettle` / `glide` (CustomEase) with the matching `--ease-liquid` / `--ease-glide` CSS
properties, `pressFeedback()`, and route the sheet/backdrop CSS transitions onto the shared curves. Tests:
easing registration, reduced-motion resolution for the new helper, and a test that no helper animates a
filter or layout property.

**P4 — Shell on glass** (`apps/web`, `packages/design-system`)
Desktop rail, mobile bottom bar, sticky page header, command palette and the ambient band onto
`GlassSurface`, with the `Cmd/Ctrl+B` collapse and the breakpoint behaviour unchanged. Tests: shell
interaction tests for the rail and bottom bar, an overflow check at 375px and 1280px, and a
reduced-transparency pass.
**Status:** the attribute/settings half landed (#104): root `data-glass`/`data-transparency`, in-app
Motion/Transparency, OS media tracking, and the OR motion semantics. The glass rail/bottom bar landed
with P5 (#105); the sticky page header remains deferred.

**P5 — Surfaces and controls** (`packages/design-system`) — **landed for #94 scope.**
Shipped: glass level/elevation variant functions with class-equivalence coverage; dialog, default sheet,
command palette and mobile bottom bar on thick glass/elevation-4; one shared 55%/8px modal scrim utility;
the reader's `surface="glass"` path and overlay behavior stay unchanged. Deferred: card, popover, tooltip,
input, tabs and select glass variants; preset tint support; rendered contrast-pair coverage from §3.5.

**P6 — States and browsing surfaces** (`packages/design-system`, `apps/web`)
Empty, loading and error states onto glass with the plate rule; library, discover and search grids get
glass chips, cover plates and the stagger reveal outside the reader. Tests: a11y tests for the states,
skeleton-to-content layout stability, and reduced-motion checks for the stagger.
**Status:** not shipped. The issue labeled P6 (#95) implemented the §2.2/§2.3 displacement/ambient work
instead; this states/browsing slice remains open.

**P7 — Design-system page and docs** (`apps/web`, `DESIGN.md`, `docs/Design.md`)
Build `apps/web/app/design-system` as the verification surface: colour roles as contrast-checked pairs
over a white and a black backdrop, the type specimen, the radius and elevation ladders, the four glass
tiers with their state matrices, and the do/don't pairs from §9. Then reconcile this file and
`docs/Design.md` with what shipped. Tests: the page's own render test, plus the overflow and console
checks the shadcn workflow's Step 7 requires.
**Status:** the page landed (#107) with all tiers, the ten type roles and the component states; the
contrast pairs, radius/elevation ladders, do/don't pairs and full docs reconciliation remain deferred.

> Roadmap note (2026-10-20): issue labels drifted from this sequence — #95 ("P6") shipped the
> displacement/ambient work and #96 ("P7") the design-system page. The states/browsing item above is
> still unshipped; read the issue numbers, not the P labels, for recent history.
