# AGENTS

This file is the operational guide for agentic coding tools working in this repo.

## Required Reading

Agents must read the relevant rewrite docs before implementation:

- Read `docs/overhaul/spec.md`, `docs/overhaul/roadmap.md` and the spec for your issue first. They win over
  every other doc.
- Read `docs/SPEC.md` before implementing or changing product behavior.
- Read `docs/ARCHITECTURE.md` before changing package boundaries, data flow, database access, provider runtime, reader internals, platform adapters, app shell structure, or motion architecture.
- Read `DESIGN.md` at the repo root (the design source of truth: tokens, typography, component styling, layout principles) and `docs/Design.md` (the binding UI rules) before creating or modifying UI, styling, layouts, themes, interactions, reader chrome, empty states, loading states, error states, or motion.

## Project Direction

MangaVerse is a local-first manga, comic and webtoon reader. The Electron desktop app for Windows, macOS and Linux is built first as the complete product, with no account or external service required. An invite-only website follows. There will never be a native mobile app. The legacy Expo tree was removed (Phase 10.5); `apps/` and `packages/` are canonical. Port behavior only after package contracts and tests exist.

## Target Stack

React + TanStack Router, as a client-rendered shell; TanStack DB (pinned) for local
data and TanStack Query for provider calls; Zustand for shared client state;
TypeScript, Zod, and Effect 4 for I/O modules. Electron first, with native SQLite +
Drizzle in a data process (browser SQLite/WASM in a Worker on web, later). shadcn/ui through `@app/design-system`; GSAP
through `@app/design-system/motion`. Monorepo of reusable packages. Optional metadata sync
via Supabase comes after local-first behavior is stable. See `docs/overhaul/`.

## Layout

`apps/web`, `apps/desktop`, and `packages/*`; `docs/` holds `SPEC.md`,
`ARCHITECTURE.md`, `Design.md`, `overhaul/` and `archive/`.

## Package Boundary Rules

Enforced by `.oxlintrc.json` (`no-restricted-imports`; `pnpm lint` fails on a violation): `@app/shared` and `@app/design-system/motion` import no app package; the rest of `@app/design-system` imports only `@app/shared` and its own motion module. The rules below are not machine-checked.

- App features consume stable package APIs.
- No reaching into provider, database, reader, platform or Electron internals from a feature.
- No raw SQL outside `@app/db`.
- No provider-specific hacks outside `@app/extensions/core`, `@app/extensions-sdk` or a provider's module under `@app/extensions`.
- No business logic inside visual components or animation code when it belongs in a feature service, domain package, repository or shared model.

## Design System Rules

- `DESIGN.md` at the repo root is the design source of truth; `docs/Design.md` holds the binding rules. Read both before UI work.
- Do not bypass the design system for one-off styling unless a missing primitive is documented.
- Use shadcn/ui components and composition patterns where available.
- Use semantic tokens instead of raw colors in UI code.
- Keep layouts responsive across desktop, tablet, and mobile web.
- Reader UI must remain calm, stable, and distraction-free.
- Themes may be visually distinct, but accessibility and component semantics must remain consistent.

## shadcn Tooling

- Components live in `packages/design-system` (Base UI `base-nova`; its `components.json` drives the CLI): `pnpm dlx shadcn@latest add <item> -c packages/design-system`. `cn` comes from the `cn` package.
- `pnpm lint` runs `@shadcn/lint` (oxlint). Skills: `.agents/skills/shadcn` (the DESIGN.md workflow) + `migrate-radix-to-base`; MCP via `opencode.json` (registry tools need `components.json`).

## Motion Rules

- Use GSAP through `@app/design-system/motion` helpers or cleanup-safe local patterns.
- React GSAP code uses `useGSAP()` from `@gsap/react` (or a `gsap.context()` cleanup), scoped to a ref.
- Wrap event-created GSAP animations with `contextSafe()` or a package helper.
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

- Local UI should render from SQLite/cache first whenever possible.
- Provider calls and cloud sync should hydrate local state asynchronously.
- Use TanStack Query for provider call caching, cancellation, retries, prefetching, and optimistic updates.
- Use TanStack Router intent preloading where useful.
- Virtualize long library grids, search results and chapter/reader lists.
- Track slow and failed provider calls.
- Support low-memory mode for constrained devices.

## Testing Expectations

- Add or update tests for core behavior.
- Prefer behavior tests over implementation-detail tests.
- Add unit tests for pure packages.
- Add integration tests for DB repositories and migrations.
- Add contract tests for provider SDK behavior.
- Add reader interaction tests for tap zones, modes, keyboard navigation, progress, and gesture-sensitive logic.
- Add migration safety tests.
- Add search aggregation tests.
- Add accessibility tests for new UI flows.
- Add reduced-motion checks for motion-heavy components.
- The production E2E serves `packages/*/dist`: rebuild after editing package sources.

Critical flows: add/search provider, add manga, open details, start/continue
reading, reader mode, tap zones, switch/migrate provider, backup, restore,
theme, reduced motion.

## Current State

The app overhaul is the active workstream: `docs/overhaul/roadmap.md` holds the order and issues, and `docs/overhaul/handoff.md` the current state. Milestone 1 (foundation and the #208 package consolidation) has landed; milestones 2 and later have not, so the sections here describing the target may still be ahead of the code.

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
- Checks: `pnpm lint` / `lint:fix`, `pnpm format` / `format:check` (oxfmt), `pnpm typecheck`, `pnpm test`, `pnpm run doctor`, `pnpm knip`
- Builds: `pnpm build`, `pnpm --filter @app/web build`, `pnpm --filter @app/desktop build`; clean with `pnpm clean`

Update this file when the canonical commands change.
