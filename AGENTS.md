# AGENTS

This file is the operational guide for agentic coding tools working in this repo.

## Required Reading

Agents must read the relevant rewrite docs before implementation:

- Read `docs/recovery/spec.md` and `docs/recovery/plan.md` before recovery work;
  they supersede the historical phase sequence.
- Read `docs/SPEC.md` before implementing or changing product behavior.
- Read `docs/PLAN.md` before selecting or sequencing implementation tasks.
- Read `docs/ARCHITECTURE.md` before changing package boundaries, data flow, database access, provider runtime, reader internals, platform adapters, app shell structure, or motion architecture.
- Read `docs/Design.md` before creating or modifying UI, styling, layouts, themes, interactions, reader chrome, empty states, loading states, error states, or motion.

## Project Direction

MangaVerse is a web-native, local-first manga, comic and webtoon reader that also ships as an Electron desktop app for Windows, macOS and Linux, replacing an Expo-first app. The legacy Expo tree was removed (Phase 10.5); `apps/` and `packages/` are canonical. Do not rescue unstable code solely for parity; port behavior only after package contracts and tests exist.

## Target Stack

React + TanStack Start (web) and Router; TanStack Query for remote state and
provider calls; Zustand for client state; TypeScript everywhere. Electron for
desktop, with Express.js where a local HTTP boundary helps. SQLite + Drizzle
(browser SQLite/WASM on web). shadcn/ui through `@app/design-system`; GSAP
through `@app/motion`. Monorepo of reusable packages. Cloud sync only after
local-first behavior is stable.

## Layout

`apps/web`, `apps/desktop`, and `packages/*`; `docs/` holds `SPEC.md`, `PLAN.md`,
`ARCHITECTURE.md`, `Design.md` and `recovery/`.

## Package Boundary Rules

Enforced by `.oxlintrc.json` (`no-restricted-imports`; `pnpm lint` fails on a violation): `@app/shared` and `@app/motion` import no app package; `@app/design-system` imports only `@app/shared` and `@app/motion`. The rules below are not machine-checked.

- App features consume stable package APIs.
- No reaching into provider, database, reader, platform or Electron internals from a feature.
- No raw SQL outside `@app/db`.
- No provider-specific hacks outside `@app/extensions-core`, `@app/extensions-sdk` or a provider extension package.
- No business logic inside visual components or animation code when it belongs in a feature service, domain package, repository or shared model.

## Design System Rules

- Read `docs/Design.md` before UI work.
- Do not bypass the design system for one-off styling unless a missing primitive is documented.
- Use shadcn/ui components and composition patterns where available.
- Use semantic tokens instead of raw colors in UI code.
- Keep layouts responsive across desktop, tablet, and mobile web.
- Reader UI must remain calm, stable, and distraction-free.
- Themes may be visually distinct, but accessibility and component semantics must remain consistent.

## Motion Rules

- Use GSAP through `@app/motion` helpers or cleanup-safe local patterns.
- React GSAP code must use `useGSAP()` from `@gsap/react` or an equivalent `gsap.context()` cleanup, always scoped to a component ref.
- Wrap event-created GSAP animations with `contextSafe()` or a package helper.
- Respect `prefers-reduced-motion`, and do not run GSAP during SSR.
- Do not use ScrollTrigger in core reader scrolling unless explicitly designed and tested as a reader-safe enhancement; remove ScrollTrigger markers from production.
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
- Virtualize long library grids, search results, chapter lists, and long reader lists.
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

Critical flows to test: add provider, search provider, add manga to library,
open manga details, start reading, continue reading, change reader mode, use tap
zones, switch provider for manga, migrate manga, backup, restore, change theme,
reduced-motion mode.

## Recovery State (current)

Web-first recovery is the active workstream; `docs/recovery/plan.md` is the single ledger (S0–S6 done, S7 covers publication). Electron is retained but deferred until the web flow is proven.

## Effect Rules

`team-conventions/no-use-effect` (`pnpm run doctor`) reports every `useEffect` call.

- Do not write new `useEffect`. Refactor existing usages to derived state, an
  event handler, `useSyncExternalStore`, `useGSAP`, or a key reset.
- A true external-system boundary (browser API, Electron IPC, subscription)
  keeps it, with an inline
  `// react-doctor-disable-next-line team-conventions/no-use-effect -- <reason>`
  and a `workit ledger ruling` recording the ruling.

## Code Quality Gates

Run both before reporting a change; both currently exit non-zero until the
react-doctor/knip arc is finished (see `docs/recovery/plan.md`).

- `pnpm run doctor` — react-doctor, all workspace projects, any finding fails
  (`blocking: warning` in `doctor.config.ts`). `pnpm doctor` is pnpm's own
  command, so the script needs `pnpm run`. CI lands the hard gate last.
- `pnpm knip` — unused files, dependencies and exports.

## Canonical Commands

- Install: `pnpm install`
- Dev: `pnpm dev` (web), `pnpm dev:web`, `pnpm dev:desktop`
- Checks: `pnpm lint` / `lint:fix`, `pnpm format` / `format:check` (oxfmt), `pnpm typecheck`, `pnpm test`, `pnpm run doctor`, `pnpm knip`
- Builds: `pnpm build`, `pnpm --filter @app/web build`, `pnpm --filter @app/desktop build`; clean with `pnpm clean`

Update this file and `docs/PLAN.md` when the canonical commands change.

