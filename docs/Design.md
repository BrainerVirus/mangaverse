# MangaVerse Design System

## Design Intent

MangaVerse should feel like a premium reading room connected to a powerful source engine. The app must balance calm reading with expressive discovery. The reader itself is quiet, stable, and distraction-free. The surrounding product can be cinematic, tactile, and memorable.

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

The default visual language is cinematic minimalism: dark ink surfaces, warm paper accents, focused content cards, precise typography, and soft depth. Expressive themes may add Sakura warmth, Cyberpunk glow, AMOLED black, or Warm Paper softness, but layout, accessibility, and component behavior stay consistent.

The app should avoid generic purple-gradient SaaS aesthetics. MangaVerse should feel tailored to long reading sessions, visual media browsing, and source management.

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

- Use a refined, highly legible body font for long UI sessions.
- Use a more distinctive display or heading face if licensing and performance allow it.
- Avoid defaulting to Arial, Roboto, or generic system-only typography for the final design.
- Use numeric tabular variants where progress, chapter counts, storage, or diagnostics are displayed.
- Keep reader chrome labels short and readable.

Type roles:

- Display: onboarding, empty states, hero discovery moments.
- Heading: page titles, settings groups, manga detail title.
- Body: descriptions, metadata, form labels.
- Caption: provider attribution, tags, diagnostics, timestamps.
- Code/mono: logs, extension IDs, checksums, diagnostics.

## Color System

Use semantic tokens rather than raw colors in components.

Core roles:

- Background: app base surface.
- Foreground: primary text.
- Muted: secondary text and low-emphasis metadata.
- Surface: cards and elevated panels.
- Surface raised: dialogs, sheets, command palette.
- Border: dividers and control outlines.
- Primary: main actions.
- Accent: selected states and theme personality.
- Success: completed operations.
- Warning: risky operations and provider limitations.
- Destructive: deletion, uninstall, destructive restore.
- Reader background: independent token for reading area.

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

- Every theme must pass contrast requirements.
- Reader background can differ from app background.
- Theme preview cards should show surface, text, accent, manga card, and reader background.
- Theme switching may animate outside the reader.
- Themes may vary density and decorative detail, but not control semantics or accessibility.

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
- Dialogs, sheets, and drawers must have accessible titles.
- Forms use structured field components and associated labels.
- Icons inside buttons use the project's icon conventions and must have accessible names where needed.

### Buttons

- Primary actions should be visually decisive.
- Destructive actions must require clear labeling and confirmation when data loss is possible.
- Icon-only buttons need accessible labels.
- Desktop hover states must not be the only affordance.
- Touch targets should be at least 44 by 44 CSS pixels where practical.

### Cards

- Manga cards prioritize cover art, title, provider/source context, progress, and unread state.
- Cards may have subtle hover/focus lift outside the reader.
- Cards should avoid excessive text overlays that obscure cover art.
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
- Use focus trapping for modal dialogs.
- Use Escape-to-close where appropriate.
- Use clear form labels and error messages.
- Keep touch targets at least 24 by 24 CSS pixels, with 44 by 44 preferred.

## Motion System

### Motion Principles

- Motion gives orientation, feedback, continuity, hierarchy, or delight.
- Motion should make the app feel faster, not slower.
- Reading surfaces stay calm.
- Motion intensity can vary by theme, but reduced-motion always wins.
- Animation code must be isolated from business logic.

### Duration Scale

- Instant: 0ms for reduced motion or state changes that should not animate.
- Micro: 90ms for button feedback and tiny affordances.
- Quick: 140ms for hover, focus, and small UI transitions.
- Standard: 220ms for panels, cards, and chrome.
- Expressive: 360ms for onboarding, empty states, and route continuity.
- Cinematic: 520ms to 700ms for rare hero moments outside reader flows.

### Easing Presets

- Standard out: `power2.out`.
- Standard in-out: `power3.inOut`.
- Emphasized out: `expo.out`.
- Soft entrance: `power1.out`.
- Snap feedback: `back.out(1.2)`.
- Scroll-linked: `none` when scrubbed or container-animation based.

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

### Reduced-Motion Behavior

- Respect system `prefers-reduced-motion`.
- Provide a user-facing motion intensity setting later if feasible.
- Reduced motion should keep instant state changes, fades under 100ms where helpful, and no parallax/scrub effects.
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

## Desktop Behavior

- Desktop app should feel native enough to justify installation.
- Use command palette for fast navigation.
- Support keyboard shortcuts and visible shortcut hints.
- Window controls must fit the theme.
- Use native file dialogs through platform APIs.
- External links must clearly leave the app.

## Mobile Behavior

- Mobile web must support touch gestures and responsive reading.
- Avoid hover-only actions.
- Use bottom sheets for dense controls.
- Reader tap zones and gestures must remain reliable.
- PWA limitations should be clearly messaged.

## Stitch Usage

When using Stitch or similar design generation tools, prompts must reference this document and preserve:

- MangaVerse product personality.
- Reading-first principle.
- Theme token roles.
- Reader calmness rules.
- Motion system constraints.
- shadcn/ui composition conventions.
- Accessibility requirements.

Generated designs are references, not direct implementation instructions. Implementation must still use package boundaries and design-system primitives.
