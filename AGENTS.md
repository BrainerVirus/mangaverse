# AGENTS

## Required Reading

- Read `docs/overhaul/spec.md`, `docs/overhaul/roadmap.md` and the spec for your issue first. They win over every other doc.
- Read `docs/SPEC.md` before implementing or changing product behavior.
- Read `docs/ARCHITECTURE.md` before changing package boundaries, data flow, database access, provider runtime, reader internals, platform adapters, app shell structure, or motion architecture.
- Read `DESIGN.md` at the repo root (the design source of truth: tokens, typography, component styling, layout principles) and `docs/Design.md` (the binding UI rules) before creating or modifying UI, styling, layouts, themes, interactions, reader chrome, empty, loading and error states, or motion.

## Project Direction

MangaVerse is a local-first manga, comic and webtoon reader. The Electron desktop app for Windows, macOS and Linux is built first as the complete product, with no account or external service. An invite-only website follows; there will never be a native mobile app. Port behavior only after package contracts and tests exist.

## Target Stack

React + TanStack Router, as a client-rendered shell; TanStack DB (pinned) for local data and TanStack Query for provider calls; Zustand for shared client state; TypeScript, Zod, and Effect 4 for I/O modules. Electron first, with native SQLite + Drizzle in a data process (browser SQLite/WASM in a Worker on web, later); shadcn/ui and GSAP come through `@app/design-system`. Optional metadata sync via Supabase comes after local-first behavior is stable.

## Layout

`apps/web`, `apps/desktop` and `packages/*` are canonical (the legacy Expo tree is gone); `docs/` holds the docs above plus `archive/`.

## Package Boundary Rules

Enforced by `.oxlintrc.json` (`no-restricted-imports`; `pnpm lint` fails on a violation): `@app/shared` and `@app/design-system/motion` import no app package; the rest of `@app/design-system` imports only `@app/shared` and its own motion module. The rules below are not machine-checked.

- App features consume stable package APIs.
- No reaching into provider, database, reader, platform or Electron internals from a feature.
- No raw SQL outside `@app/db`.
- No provider-specific hacks outside `@app/extensions/core`, `@app/extensions-sdk` or a provider's module under `@app/extensions`.
- No business logic inside visual components or animation code when it belongs in a feature service, domain package, repository or shared model.

## Design System Rules

- Read `DESIGN.md` and `docs/Design.md` first (see Required Reading).
- Do not bypass the design system for one-off styling unless a missing primitive is documented; use shadcn/ui components and composition patterns where available.
- Use semantic tokens instead of raw colors in UI code.
- Keep layouts responsive across desktop, tablet, and mobile web.
- Reader UI must remain calm, stable, and distraction-free.
- Themes may differ visually, but accessibility and component semantics must stay consistent.

## UI Pattern Rules

`pnpm lint` fails on the visual patterns below. Three layers, all inside `pnpm lint`:

- `@shadcn/lint` (`.oxlintrc.json`, all six rules at `error`): `no-restyle` (className on a design-system component), `no-arbitrary-values` (`p-[13px]`, `bg-[#fff]`, `rounded-[10px]`), `no-raw-colors` (`bg-red-500`), `no-inline-styles` (inline `style`; the per-frame exceptions are the file overrides at the bottom of the config: virtualized grid rows, reader transform layers, the onboarding fade), `no-unknown-classes`, `require-static-classes`.
- `lint/ui-conventions.cjs`, all 14 rules at zero (`.oxlintrc.json`; `lint/ui-baseline.json` is empty and only shrinks): `no-space-utilities` (`space-x-*`/`space-y-*` in any file, resets and `-reverse` included, primitives too; use `flex flex-col gap-N` or `flex gap-N` on the parent, and `self-start` on an inline-flex child such as a `Button` or `TabsList` that must not stretch), `no-nested-card` (a `Card` or `SettingsSection` inside another, directly or through any depth of components defined in the same file), `no-hand-rolled-glass` (`backdrop-*`, `bg-white/N`, `bg-black/N` outside the reader stage; start from `GlassSurface`), `no-border-ring-doubling` (a resting `border` plus a resting `ring-N`/`outline-N` on one element, reported when both are unconditional in one carrier (strings, arrays, templates, additive `cn` arguments) or picked together by `cva`/`tv` axes; operands of `?:`, `&&`, `||`, `clsx` objects and same-axis options are never paired, so `cn('border', open && 'ring-1')` is not caught; focus rings behind `focus-visible:` stay legal), `no-list-row-overrides` (a `ListRow` className with its own fill, border, radius, shadow or padding; use its tones/paddings), `no-outlined-row-in-card` (an outlined `ListRow` inside a `Card` or `SettingsSection`; use `muted`/`plain` or a divided list).
- `no-filled-row-in-settings` rejects a default or `muted` `ListRow` nested directly or through JSX wrappers inside a `SettingsSection` in the same file; use a divided list or a plain row. Stateful warning rows remain permitted. Like other static rules, it cannot see through imported components or dynamic tones.
- The same plugin's other rules, also at zero (the old frozen-site baseline is empty; `pnpm lint:ui-baseline --shrink` is the ratchet if a temporary exemption is ever needed): `no-off-scale-radius` (`rounded`, `rounded-md|lg|xl`; use `rounded-box|control|btn|badge|glass`), `no-off-scale-shadow` (bare `shadow`, `shadow-xs|2xl|inner`, `drop-shadow-*`; use `shadow-sm|md|lg|xl`), `no-hand-rolled-heading` (`h1`-`h6` with `text-lg`, `font-semibold`; use `type-display-lg|title|heading`), `no-hand-built-panel` (a `div`/`li`/`p` in `apps/**` or `packages/extensions/**` with radius, fill or border, and padding; use `Card`, `Alert`, `GlassPanel`, or add one shared row primitive), `prefer-size-utility` (`h-4 w-4` is `size-4`), `no-arbitrary-in-variant-maps` (arbitrary values in `*-variants.ts`, which @shadcn/lint cannot read), `no-direct-gsap-import` (import motion from `@app/design-system/motion`, not `gsap`), `no-hover-without-focus` (an `a`, `button` or `Link` with a `hover:` style needs its own `focus`/`focus-visible`/`focus-within` utility that shows: a ring with a width, an outline other than none/hidden/0, or a fill, text, border, shadow, opacity, transform or underline; `group-focus`, a colour-only or offset-only ring, `focus:outline-none` alone and a `className` prop do not count; `buttonVariants` counts, `cva`/`tv` only through the focus utilities in their arguments).
- `useState` and `try/catch` keep their own baseline (`lint/baseline.json`, `team-conventions/no-use-state`, `no-try-catch`).

Baselines only shrink. A new use of a baselined rule fails; fixing one fails until you run `pnpm lint:ui-baseline --shrink` (UI rules) or `pnpm lint:baseline --shrink` (state) and commit the lowered file. A raised count fails against the merge base, and a `oxlint-disable` naming a baselined rule fails too. Measured 2026-11-07 at `7b9063d4`: 0 UI sites (the 129-site UI baseline was cleared); `useState` 140 in 52 files; `try/catch` 114 in 54 files.

A rule takes an inline `oxlint-disable-next-line ui-conventions/<rule> -- <reason>` only for a documented exception, with a `workit ledger ruling`. Cross-file card nesting (a `Card` wrapping a component imported from another file that renders a `Card`) cannot be seen by a linter; check it in review.

Tests: `node --test lint/ui-conventions.test.mjs` (a red and a green fixture per rule, the repo config on a red fixture, the ui baseline through the script). `pnpm test` runs it. Not encoded, because they would report legitimate code: `focus:outline-none` without a ring (4 sites, all intentional: a programmatic focus target, a listbox row that shows focus as a fill, a dialog container, the palette's search field), `text-sm/xs` against `type-*` (DESIGN.md §4 keeps `text-sm` as the components' convention), `bg-muted/NN` alpha steps, and `border` beside `focus-visible:ring-*` (the shadcn focus pattern).

## shadcn Tooling

- Components live in `packages/design-system` (Base UI `base-nova`; its `components.json` drives the CLI): `pnpm dlx shadcn@latest add <item> -c packages/design-system`. `cn` comes from the `cn` package.
- `pnpm lint` runs `@shadcn/lint` (oxlint). Skills: `.agents/skills/shadcn` (the DESIGN.md workflow) + `migrate-radix-to-base`; MCP via `opencode.json` (registry tools need `components.json`).

## Motion Rules

- Use GSAP through `@app/design-system/motion` helpers or cleanup-safe local patterns. React GSAP code uses `useGSAP()` from `@gsap/react` (or a `gsap.context()` cleanup), scoped to a ref; wrap event-created animations with `contextSafe()` or a package helper.
- Respect `prefers-reduced-motion`, and do not run GSAP during SSR.
- Do not use ScrollTrigger in core reader scrolling unless designed and tested as a reader-safe enhancement; remove its markers from production.
- Do not animate layout-heavy properties when transform or opacity can achieve the effect.

## Reader Performance Rules

- Reader interactions must stay stable and performant; keep tap zones reliable with zoom, scroll and overlays.
- Do not let reader gestures, zoom, tap zones or page preloading depend on global app rerenders.
- High-frequency reader state should stay local or in refs, not broad Zustand stores.
- Progress persistence should be debounced, batched or checkpoint-based.
- Reader motion is limited to chrome transitions, safe page transitions, settings panels and explicit feedback; avoid decorative animation while reading.

## Extension Security Rules

- Do not bundle third-party source extensions in the core app by default unless explicitly approved.
- Keep provider distribution separate from the app shell; require explicit user confirmation before installing provider code.
- Validate extension manifests before install, and show source URL, version, permissions, capabilities, languages and content flags.
- Support user-provided registries, manual URL installs, and checksums or signatures where feasible.
- Allow disabling broken or dangerous providers; provider code must not import app internals.
- Provider errors must be normalized and isolated from the rest of the app.

## Local-First Performance Rules

- Local UI should render from SQLite/cache first whenever possible; provider calls and cloud sync should hydrate local state asynchronously.
- Use TanStack Query for provider call caching, cancellation, retries, prefetching, and optimistic updates; use TanStack Router intent preloading where useful.
- Virtualize long library grids, search results and chapter/reader lists; track slow and failed provider calls; support low-memory mode for constrained devices.

## Testing Expectations

- Add or update tests for core behavior; prefer behavior tests over implementation-detail tests.
- Add unit tests for pure packages, integration tests for DB repositories and migrations, contract tests for provider SDK behavior, migration safety tests and search aggregation tests.
- Add reader interaction tests for tap zones, modes, keyboard navigation, progress, and gesture-sensitive logic.
- Add accessibility tests for new UI flows and reduced-motion checks for motion-heavy components.
- The production E2E serves `packages/*/dist`: rebuild after editing package sources.

Critical flows: add/search provider, add manga, open details, start/continue reading, reader mode, tap zones, switch/migrate provider, backup, restore, theme, reduced motion.

## Current State

The overhaul is active: milestones 1, 2 and 4 have landed; 3 awaits owner-approved recipes; 5 (reader) is in progress. Order and issues: `docs/overhaul/roadmap.md`; current state: `docs/overhaul/handoff.md`.

## Effect Rules

`team-conventions/no-use-effect` (`pnpm run doctor`) reports every `useEffect` call.

- Do not write new `useEffect`. Refactor existing usages to derived state, an
  event handler, `useSyncExternalStore`, `useGSAP`, or a key reset.
- A true external-system boundary (browser API, Electron IPC, subscription)
  keeps it, with an inline
  `// react-doctor-disable-next-line team-conventions/no-use-effect -- <reason>`
  and a `workit ledger ruling` recording the ruling.

## Code Quality Gates

CI runs both after the build; run both before reporting a change.

- `pnpm run doctor` — react-doctor, all workspace projects, any finding fails
  (`blocking: warning` in `doctor.config.ts`). `pnpm doctor` is pnpm's own
  command, so the script needs `pnpm run`.
- `pnpm knip` — unused files, dependencies and exports.

## Canonical Commands

- Install: `pnpm install`
- Dev: `pnpm dev` (web), `pnpm dev:web`, `pnpm dev:desktop`
- Checks: `pnpm lint` / `lint:fix` / `lint:baseline` / `lint:ui-baseline`, `pnpm format` / `format:check` (oxfmt), `pnpm typecheck`, `pnpm test`, `pnpm run doctor`, `pnpm knip`
- Builds: `pnpm build`, `pnpm --filter @app/web build`, `pnpm --filter @app/desktop build`; clean with `pnpm clean`
- Electron smoke (after a desktop build): `pnpm --filter @app/desktop test:e2e:electron`. The packaged proof runs `pnpm --filter @app/desktop package:mac` first, then `pnpm --filter @app/desktop test:e2e:packaged`.

Update this file when the canonical commands change.
