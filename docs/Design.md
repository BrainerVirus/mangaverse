# MangaVerse Design System

`DESIGN.md` at the repository root is the **target design language**: the material system, colour,
typography, motion, device adaptation, component recipes, and the roadmap that builds them. This
document holds the **binding rules** — the constraints a contributor or agent must not break. Where a
value is needed (a token, a duration, a blur radius, a contrast floor), read `DESIGN.md` — the single
source for values; this file points at it instead of restating values.

## Design Intent

MangaVerse should feel like light moving through water: a premium reading room connected to a powerful
source engine. The app must balance calm reading with expressive discovery. The reader itself is quiet,
stable, and distraction-free — water at night. The surrounding product can be luminous, tactile, and
memorable — daylight on a surface.

Use this document before creating or modifying UI.

## Product Personality

- Premium but not sterile.
- Fast and confident.
- Calm while reading.
- Expressive while discovering.
- Technical enough for power users.
- Friendly enough for casual readers.
- Desktop-native where desktop affordances matter.
- Mobile-web friendly without feeling like a compromised desktop app.

## Design Principles

- Reading comes first.
- Discovery should feel exciting.
- Power-user features should be available but not visually overwhelming.
- Motion should guide, not distract.
- The reader must stay calm and fast.
- Settings should be deep but organized.
- Provider complexity should be hidden until needed.
- The app should feel premium on both mobile and desktop.
- Accessibility is not optional.
- Every visual effect must have a purpose.

## Visual Theme And Atmosphere

The visual language is **liquid glass**: a warm, calm, deep substrate with translucent surfaces floating
above it, lit along their top edge, blurred and saturated so the content behind them stays readable. Glass
shows the thing behind it — the page under the reader chrome, the cover under the shelf — and it never
becomes plastic: no flat gray slabs, no hard borders standing in for depth, no decoration competing with
page art.

Expressive themes may add Sakura warmth, Cyberpunk glow, AMOLED black, or Warm Paper softness, but
layout, material behaviour, accessibility, and component behaviour stay consistent.

The app should avoid generic purple-gradient SaaS aesthetics. MangaVerse should feel tailored to long
reading sessions, visual media browsing, and source management.

## Material Rules

- Glass is one of the four tiers defined in `DESIGN.md` §2.1 (`thin`, `regular`, `thick`, `stage`). Pick a
  tier; never hand-write a blur radius, a translucent fill, or a saturation value in a component.
- Every glass surface starts from the `GlassSurface` primitive. `backdrop-filter` is set by the tier
  utilities, with one documented exception: the shared 55%/8px modal scrim (`glass-scrim`). The §2.2
  light layer comes from `RefractionLayer` (rendered by `GlassSurface`, never hand-built); the opt-in
  displacement variant is applied to the owning `GlassSurface` element, because a child
  `backdrop-filter` samples nothing inside the parent backdrop root. The §2.3 band comes from
  `AmbientBackdrop` (rendered once by the shell).
- Glass needs something to refract: the shell's ambient band, page art in the reader, or cover art in a
  grid. Glass over a flat, empty surface is a flat panel with a cost.
- Depth is the four-step elevation scale plus the specular top edge. A shadow outside that scale is a bug.
- Text on glass follows the contrast floor and the placement rules in `DESIGN.md` §3.5. `--muted-foreground`
  is never used on glass; secondary glass text uses `--glass-muted-foreground`; text over imagery needs a
  plate and at least `regular` glass.
- Every material degrades: no `backdrop-filter` support, reduced transparency, and the low-end device
  profile all resolve to the opaque token, keeping the hierarchy intact. The shell signals them with
  `data-glass="cheap"` / `data-transparency="solid"` on the root (`DESIGN.md` §2.5); a component never
  re-implements that resolution.
- Never animate `backdrop-filter`, a blur radius, or a shadow. Animate opacity and transform of the layer.
- Blur budget and nesting rules: `DESIGN.md` §2.5 — count blurred layers per view, and never nest two
  tiers that blur imagery (a thin tint inside a glass panel is legal).
- The reader's stage glass is theme-independent: dark glass, white type, opaque plates under control rows.

## Layout System

### App Shell

- Desktop uses a persistent navigation rail or sidebar where width allows it.
- Tablet uses adaptive side navigation or bottom navigation based on available space.
- Mobile uses bottom navigation and full-screen flows.
- Reader route may hide global navigation entirely.
- Command palette is a first-class desktop navigation surface.

### Page Structure

- Use clear page titles with short supporting descriptions.
- Keep primary actions near the page title on desktop.
- Move primary actions to sticky bottom or top bars on mobile where appropriate.
- Use content max-widths for text-heavy settings pages.
- Use full-bleed grids for library and discovery where visual browsing matters.

### Spacing

- Use generous outer margins on desktop.
- Use compact but breathable spacing on mobile.
- Prefer `gap-*` over margin stacks.
- Avoid dense controls unless the mode is explicitly compact.
- Reader controls must not crowd tap zones.

## Typography

The type scale, weights, tracking, and the glass-specific adjustments live in `DESIGN.md` §4. The rules:

- Use a refined, highly legible body font for long UI sessions.
- Use a more distinctive display or heading face only when it is licensed and its weight cost is paid for;
  the display role is Inter today (`DESIGN.md` §4), and bundling a webfont is an open decision.
- Avoid defaulting to Arial, Roboto, or generic system-only typography for the final design.
- Use numeric tabular variants where progress, chapter counts, storage, or diagnostics are displayed.
- Keep reader chrome labels short and readable.
- On glass the type floors are stricter than on matte surfaces (`DESIGN.md` §4), and a text shadow is never
  used to buy contrast — use a plate.

Type roles:

- Display: onboarding, empty states, hero discovery moments.
- Heading: page titles, settings groups, manga detail title.
- Body: descriptions, metadata, form labels.
- Caption: provider attribution, tags, diagnostics, timestamps.
- Code/mono: logs, extension IDs, checksums, diagnostics.

## Color System

Use semantic tokens rather than raw colors in components. The full palette, the light/dark pairs, the
glass tokens, and the measured contrast floor live in `DESIGN.md` §3.

Core roles:

- Background: app base surface.
- Foreground: primary text.
- Muted: secondary text and low-emphasis metadata.
- Surface: cards and elevated panels.
- Surface raised: dialogs, sheets, command palette.
- Border: dividers and control outlines on matte surfaces.
- Primary: main actions.
- Accent: selected states and theme personality.
- Success: completed operations.
- Warning: risky operations and provider limitations.
- Destructive: deletion, uninstall, destructive restore.
- Reader background: independent token for reading area.

Glass roles (`DESIGN.md` §2.1, §3.4):

- Glass tiers: `thin`, `regular`, `thick`, `stage` — the only translucent fills in the app.
- Glass edge and specular highlight: the hairline and top light on a glass layer.
- Glass muted ink: the only secondary text colour allowed on glass.
- Glass status colours: the darker light-mode destructive, success, and warning values for glass text.

Contrast on glass is not optional: the floors and the placement rules are `DESIGN.md` §3.5, measured
against the effective composited colour and verified over both a white and a black backdrop.
`--muted-foreground` is never used on glass.

Status must never rely on color alone. Pair color with labels, icons, badges, or text.

## Theme System

Themes must share semantic roles while allowing visual personality.

Required themes:

- Minimal Light: quiet white/gray surfaces for daytime reading.
- Minimal Dark: balanced dark UI for general use.
- Vercel Monochrome: crisp black, white, gray, and sharp hierarchy.
- Sakura: warm whites, soft pink accents, delicate decorative details.
- Cyberpunk: deep dark surfaces, electric accent glows, high contrast.
- AMOLED Black: true black reader-friendly surfaces.
- Warm Paper: sepia paper background and low-glare text.
- High Contrast: strict contrast and strong focus states.
- System: follows OS preference.

Theme rules:

- Every new custom theme should pass contrast requirements; the editor warns, offers fixes, and
  requires an explicit acknowledgement before saving a known failing pair. Shipped built-in themes
  are frozen.
- Reader background can differ from app background.
- Theme preview cards should show surface, text, accent, manga card, and reader background.
- Theme switching may animate outside the reader.
- Themes may vary density and decorative detail, but not control semantics or accessibility.
- Themes may tint the glass fills; they may never change a glass tier, the elevation scale, a radius, or
  component behaviour.

## Component Rules

### shadcn/ui Usage

- Prefer existing shadcn/ui components before custom markup.
- Use semantic tokens such as `bg-background`, `text-muted-foreground`, and `border-border`.
- Use component variants before custom classes.
- Use `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter` for cards.
- Use `Alert` for warnings and callouts.
- Use `Empty` patterns for empty states.
- Use `Skeleton` for loading placeholders.
- Use `Badge` for labels and statuses.
- Use `GlassSurface` (and `GlassPanel`) for anything translucent; never write a raw `backdrop-blur-*`,
  `bg-white/10`, or `bg-black/80` in a component. `GlassSurface` refuses to nest two imagery-blurring
  tiers (`DESIGN.md` §2.5).
- Dialogs, sheets, and drawers must have accessible titles.
- Forms use structured field components and associated labels.
- Icons inside buttons use the project's icon conventions and must have accessible names where needed.

### Buttons

- Primary actions should be visually decisive.
- Destructive actions must require clear labeling and confirmation when data loss is possible.
- Icon-only buttons need accessible labels.
- Desktop hover states must not be the only affordance.
- Touch targets follow the sizes and spacing in `DESIGN.md` §6.1.

### Cards

- Manga cards prioritize cover art, title, provider/source context, progress, and unread state.
- Cards may have subtle hover/focus lift outside the reader.
- Cards should avoid excessive text overlays that obscure cover art.
- **Cards are content, not layout.** Never nest a Card inside another Card (or a
  `SettingsSection` inside a Card). Use headings and spacing for sections; a preview frame is a flat
  fill with no border and may contain at most one sample card. One border per visual grouping.
- Multi-provider titles need a visible source indicator or stacked-source affordance.

### Dialogs And Sheets

- Use dialogs for confirmation and focused decisions.
- Use sheets for settings, filters, and contextual side panels.
- Trap focus in modal overlays.
- Escape closes non-destructive overlays.
- Destructive confirmations must not close accidentally without preserving context.

### Command Palette

- Desktop command palette should feel fast and native.
- It must support keyboard-only use.
- It should include navigation, recent manga, extension actions, settings shortcuts, and diagnostics commands.
- Results should be grouped and labeled.

## Manga Card Rules

- Cover is the hero element.
- Title should be readable at common grid sizes.
- Provider badges should be subtle but visible.
- Unread count and progress must be legible.
- NSFW or content warning indicators must be explicit and not color-only.
- Multi-provider status must be shown without crowding the card.
- Hover/focus motion is allowed outside reader routes.
- Mobile cards must not depend on hover.

## Library Layout Rules

- Grid is the default visual browsing mode.
- List mode is for dense management.
- Compact mode is for power users and large libraries.
- Category tabs or side filters should not hide search within library.
- Bulk edit mode must be visually distinct.
- Failed update reports should be easy to find but not alarming unless action is needed.

## Search Layout Rules

- Global search must make provider attribution clear.
- Partial failures should be shown per provider with retry.
- Advanced filters should appear only when supported by selected providers.
- Empty states should suggest provider install, filter reset, or recent searches.
- Search results may reveal with staggered motion when reduced motion is not requested.

## Settings Layout Rules

- Organize settings by scope: app, reader, providers, extensions, storage, backup, diagnostics.
- Show inherited vs per-title reader overrides clearly.
- Use progressive disclosure for advanced settings.
- Provider settings must be capability-aware.
- Dangerous reset actions belong in clearly separated danger zones.

## Reader UX Rules

- Reader is calm by default.
- Global navigation is hidden in fullscreen reader.
- Reader chrome should appear predictably on tap, keyboard action, pointer movement, or explicit command.
- Tap zones must never conflict with visible controls.
- Tap zone debug overlay is a diagnostic mode, not a default visual feature.
- Zoom, pan, tap, and scroll interactions take priority over decorative animation.
- Reader controls must be keyboard accessible.
- Reader progress must be visible when chrome is open.
- Reader errors need retry and back actions.
- Reader should avoid surprise UI shifts after images load.
- Reader chrome uses the `stage` glass tier with opaque plates under its control rows, so white labels stay
  legible over any page (the floor and the placement rules are `DESIGN.md` §3.5). The other translucent
  surfaces inside the reader are the ones `DESIGN.md` §7.6 names — the mode pill's `thin` tint, the rail's
  preview popover and the offline toast (`stage`), and the reader's own modals (the settings sheet and the
  chapter transition card).
- The reader's page transition animates the page layer only; tap zones, chrome insets, and the zoom layer
  never move during a transition, and a second navigation request cancels the tween immediately.

Allowed reader motion:

- Chrome fade/slide show-hide.
- Low-cost page transition options.
- Settings drawer transition.
- Chapter transition screen.
- Subtle progress feedback.

Banned reader motion:

- Decorative parallax over pages.
- ScrollTrigger effects that hijack reading scroll.
- Animations that change tap zone geometry during interaction.
- Infinite ambient animations near page content.
- Hover effects that obscure page controls or content.
- Motion that blocks page navigation, zoom, pan, or preloading.

## Accessibility Rules

- Meet WCAG 2.2 AA as the baseline.
- Use visible focus states on all interactive controls.
- Keep focus from being obscured by sticky headers, footers, or overlays.
- Support keyboard navigation across app shell, reader, command palette, dialogs, settings, and extension flows.
- Use screen-reader-friendly labels for icon buttons, manga actions, provider actions, and reader controls.
- Use sufficient contrast for text, controls, icons, and focus rings.
- Do not rely on color alone for status.
- Respect `prefers-reduced-motion`.
- Respect reduced transparency: glass resolves to its opaque token when the OS asks, when the user turns
  transparency down in appearance settings, or when the device is low-end (`DESIGN.md` §2.5).
- Use focus trapping for modal dialogs.
- Use Escape-to-close where appropriate.
- Use clear form labels and error messages.
- Keep touch targets at the sizes `DESIGN.md` §6.1 requires.
- Text on glass meets the floors in `DESIGN.md` §3.5, verified over both a white and a black backdrop.
- Decorative layers (sheen, specular, refraction, ambient band) are `aria-hidden` and never interactive.

## Motion System

### Motion Principles

- Motion gives orientation, feedback, continuity, hierarchy, or delight.
- Motion should make the app feel faster, not slower.
- Reading surfaces stay calm.
- Motion intensity can vary by theme, but reduced-motion always wins.
- Animation code must be isolated from business logic.

### Duration Scale

The duration tokens are defined in `packages/motion/src/tokens/duration.ts` and documented in `DESIGN.md`
§5.1. Never hard-code a millisecond value in a component: import `DURATION` from `@app/motion`.

### Easing Presets

The easing presets are defined in `packages/motion/src/tokens/easing.ts` and documented in `DESIGN.md`
§5.2. Use `EASING` from `@app/motion`; never write an easing string inline.

`EASING.emphasizedOut` is **`expo.out` — GSAP's exponential ease-out**, unrelated to the Expo framework
(this repository no longer uses Expo). Write it as `expo.out` in GSAP code and never as "expo" in prose.

### Page Transition Rules

- Route transitions should preserve orientation and not hide loading failures.
- Use shorter transitions for frequently visited routes.
- Use stronger transitions for onboarding, install confirmation, and theme previews.
- Reader route transitions should prioritize speed and stability.

### Microinteraction Rules

- Hover/focus effects may use small `y`, `scale`, `autoAlpha`, or shadow token changes.
- Prefer transform and opacity over layout-heavy properties.
- Avoid animating width, height, top, left, or expensive filters unless measured and justified.
- Do not animate controls in a way that changes target location during click/tap.
- Never animate focus: the focus ring appears instantly, at full contrast, on the first frame.
- Glass layers animate `opacity` and `transform` only — never `backdrop-filter`, a blur radius, or a shadow.
- Press feedback is a small damped scale (`DESIGN.md` §5.3), never a colour-only change and never a bounce.

### Reduced-Motion Behavior

- Respect system `prefers-reduced-motion`.
- Ship the user-facing Motion (Full / Reduced) and Transparency (Full / Reduced) settings described in
  `DESIGN.md` §5.5. Reduced wins if **either** the OS query or the in-app setting asks for it; Full
  cannot undo an OS reduction, and neither may hide state.
- Reduced motion should keep instant state changes and no parallax, scrub, or looping motion.
- Reduced transparency resolves every glass tier to its opaque token and turns the ambient band off.
- ScrollTrigger experiences should be disabled or replaced with static layouts.

### GSAP Usage Conventions

- Register GSAP plugins once in `@app/motion`.
- React components use `useGSAP()` from `@gsap/react`.
- Always pass a scope ref to `useGSAP()`.
- Wrap delayed/event-created animation callbacks with `contextSafe()` or a package helper.
- Use timelines for coordinated sequences instead of chained delays.
- Use `autoAlpha` instead of raw opacity when hidden elements should not be interactive.
- Use transform aliases such as `x`, `y`, `scale`, `rotation`, `xPercent`, and `yPercent`.
- Do not run GSAP during SSR.
- Clean up ScrollTriggers on unmount through `useGSAP()` context or explicit cleanup.

### ScrollTrigger Rules

- Use ScrollTrigger for discovery, onboarding, theme preview, and editorial surfaces.
- Avoid ScrollTrigger in core reader scrolling unless explicitly designed for a tested webtoon enhancement.
- Remove markers from production.
- Use `ease: 'none'` for scrubbed/container animations.
- Refresh after layout changes that affect trigger positions.
- Create triggers in page order or use refresh priorities.
- Disable ScrollTrigger effects in reduced-motion mode.

## Loading States

- Prefer skeletons for expected content shapes.
- Use progress indicators for long-running backup, restore, migration, or provider install flows.
- Show provider-level loading in search instead of blocking the whole page.
- Reader loading should be minimal and not visually noisy.

## Empty States

- Empty states should explain what happened and suggest the next action.
- Use expressive illustrations or motion outside reader contexts.
- Keep empty states concise and action-oriented.
- Examples: empty library, no provider installed, no search results, no chapters, no backups.

## Error States

- Errors must be specific and recoverable when possible.
- Provider errors should show provider attribution.
- Partial failure should not become a full-page failure.
- Destructive restore errors must preserve user confidence and explain what changed.
- Reader image errors need retry and skip/back options.

## Responsive Behavior

- Mobile layouts prioritize thumb reach, large targets, and simple navigation.
- Tablet layouts can use split views where useful.
- Desktop layouts use keyboard shortcuts, side navigation, command palette, hover/focus affordances, and wider information density.
- Feature parity should not require identical layouts.
- Breakpoints and the touch vs pointer contract live in `DESIGN.md` §6. Touch gestures use the thresholds
  shipped in `packages/reader` (never a locally invented one); pointer affordances exist only under
  `@media (hover: hover) and (pointer: fine)` and are never the only affordance.
- The glass budget is per view, not per breakpoint, and the nesting rules apply: `DESIGN.md` §2.5.

## Desktop Behavior

- Desktop app should feel native enough to justify installation.
- Use command palette for fast navigation.
- Support keyboard shortcuts and visible shortcut hints.
- Window controls must fit the theme.
- Use native file dialogs through platform APIs.
- External links must clearly leave the app.
- Hover exists only where the pointer is fine and hovering, and every hover state has a focus and a pressed
  equivalent.

## Mobile Behavior

- Mobile web must support touch gestures and responsive reading.
- Avoid hover-only actions.
- Use bottom sheets for dense controls.
- Reader tap zones and gestures must remain reliable.
- Visible reader controls always win over tap zones, and no control sits under the chrome insets.
- PWA limitations should be clearly messaged.

## Stitch Usage

When using Stitch or similar design generation tools, prompts must reference `DESIGN.md` (values) and this
document (rules), and preserve:

- MangaVerse product personality.
- Reading-first principle.
- Theme token roles.
- The liquid-glass material rules and their fallbacks.
- Reader calmness rules.
- Motion system constraints.
- shadcn/ui composition conventions.
- Accessibility requirements.

Generated designs are references, not direct implementation instructions. Implementation must still use package boundaries and design-system primitives.
