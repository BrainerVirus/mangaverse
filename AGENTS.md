# AGENTS

This file is the operational guide for agentic coding tools working in this repo.

## Required Reading

Agents must read the relevant rewrite docs before implementation:

- Read `docs/SPEC.md` before implementing or changing product behavior.
- Read `docs/PLAN.md` before selecting or sequencing implementation tasks.
- Read `docs/ARCHITECTURE.md` before changing package boundaries, data flow, database access, provider runtime, reader internals, platform adapters, app shell structure, or motion architecture.
- Read `docs/Design.md` before creating or modifying UI, styling, layouts, themes, interactions, reader chrome, empty states, loading states, error states, or motion.

## Project Direction

MangaVerse is being rewritten from an Expo-first app into a web-native, local-first manga, comic, and webtoon reader that can also ship as an Electron desktop app for Windows, macOS, and Linux.

The current Expo codebase is feature inventory and migration reference. Do not rescue unstable code solely for parity. Port behavior only after package contracts and tests exist.

## Target Stack

- Framework: React + TanStack Start for the web app.
- Routing: TanStack Router.
- Remote/server-state and provider-call caching: TanStack Query.
- Client/UI state: Zustand.
- Language: TypeScript throughout apps and packages.
- Desktop: Electron.
- Desktop-local APIs: Express.js where a local HTTP boundary is useful.
- Database: SQLite with Drizzle ORM.
- Web database runtime: browser SQLite/WASM.
- Desktop database runtime: Electron-compatible SQLite driver selected during implementation.
- UI: shadcn/ui through `@app/design-system` wrappers.
- Motion: GSAP, `@gsap/react`, timelines, and ScrollTrigger through `@app/motion`.
- Architecture: monorepo with reusable packages.
- Future sync: Supabase or similar cloud sync only after local-first behavior is stable.

## Planned Monorepo Layout

```txt
apps/
  web/
  desktop/
packages/
  reader/
  extensions-core/
  extensions-sdk/
  db/
  design-system/
  motion/
  library/
  search/
  migration/
  settings/
  theme/
  platform/
  shared/
  test-utils/
docs/
  SPEC.md
  PLAN.md
  ARCHITECTURE.md
  Design.md
```

## Package Boundary Rules

- App features consume stable package APIs.
- Features must not reach directly into provider internals, database internals, reader internals, platform internals, or Electron internals.
- Do not add raw SQL outside `@app/db`.
- Do not add provider-specific hacks outside `@app/extensions-core`, `@app/extensions-sdk`, or provider extension packages.
- Do not place business logic inside visual components when it belongs in a feature service, domain package, repository, or shared model.
- Do not place business logic inside animation code.
- `@app/motion` must not contain business logic.
- `@app/design-system` must not import feature packages.
- `@app/shared` must stay generic and must not import app shells, feature packages, database implementation, provider runtime, or UI.

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
- React GSAP code must use `useGSAP()` from `@gsap/react` or an equivalent `gsap.context()` cleanup.
- Always scope GSAP selectors to a component ref.
- Wrap event-created GSAP animations with `contextSafe()` or a package helper.
- Respect `prefers-reduced-motion`.
- Do not run GSAP during SSR.
- Do not use ScrollTrigger in core reader scrolling unless explicitly designed and tested as a reader-safe enhancement.
- Do not animate layout-heavy properties when transform or opacity can achieve the effect.
- Remove ScrollTrigger markers from production.

## Reader Performance Rules

- Reader interactions must stay stable and performant.
- Keep tap zones reliable with zoom, scroll, and overlays.
- Do not let reader gestures, zoom, tap zones, or page preloading depend on global app rerenders.
- High-frequency reader state should stay local or in refs, not broad Zustand stores.
- Progress persistence should be debounced, batched, or checkpoint-based.
- Reader motion is limited to chrome transitions, safe page transitions, settings panels, and explicit feedback.
- Avoid decorative animation during actual reading.

## Extension Security Rules

- Do not bundle third-party source extensions in the core app by default unless explicitly approved.
- Keep provider distribution separate from the app shell.
- Require explicit user confirmation before installing provider code.
- Validate extension manifests before install.
- Show provider source URL, version, permissions, capabilities, languages, and content flags before install.
- Support user-provided registries and manual URL installs.
- Support checksums or signatures where feasible.
- Allow disabling broken or dangerous providers.
- Provider code must not import app internals directly.
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

Critical flows to test:

- Add provider.
- Search provider.
- Add manga to library.
- Open manga details.
- Start reading.
- Continue reading.
- Change reader mode.
- Use tap zones.
- Switch provider for manga.
- Migrate manga.
- Backup.
- Restore.
- Change theme.
- Reduced-motion mode.

## Current Legacy Repo Notes

The existing repo still contains Expo, React Native, NativeWind, Expo Router, Tauri, and legacy service/store structures. These are not the target architecture for the rewrite unless a task explicitly asks to maintain legacy code.

If working on legacy code before the rewrite replaces it:

- Respect existing files and user changes.
- Do not revert unrelated changes.
- Keep fixes minimal.
- Run the existing relevant commands when practical.

## Existing Legacy Commands

Legacy Expo/Tauri commands (prefixed with `legacy:` to avoid accidental use):
- Legacy install: `npm install` (use `pnpm install`)
- Legacy start: `npm run legacy:start`
- Legacy web: `npm run legacy:web`
- Legacy desktop dev: `npm run legacy:desktop:dev`
- Legacy desktop build: `npm run legacy:desktop:build`
- Legacy lint: `npm run lint` (old eslint)
- Legacy tests: `npm test` (old jest)

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Documentation Foundation | ✅ Complete | SPEC.md, PLAN.md, ARCHITECTURE.md, Design.md |
| Phase 1: Monorepo Foundation | ✅ Complete | TanStack Start web app, Electron desktop app |
| Phase 7: Design System & Motion System | ✅ Complete | `@app/motion` and `@app/design-system` implemented and tested |

### Phase 7 Completed Deliverables

**`@app/motion`** — GSAP animation foundation:
- `registerGsapPlugins()`, `useGsapContext()`, `useReducedMotion()`, `useIsClient()`
- `DURATION` and `EASING` tokens per Design.md
- Animation helpers: `fadeIn/Out`, `slideUp/Down`, `scaleIn`, `staggerIn`, `createTimeline`
- Reader-safe helpers: `chromeShow/Hide`, `pageTurn`, `settingsDrawerTransition`
- Route transitions: `routeEnter`, `routeExit`
- All helpers respect `prefers-reduced-motion`
- 45 tests passing

**`@app/design-system`** — CSS tokens + shadcn wrappers + domain primitives:
- `styles/globals.css` with Tailwind v4 `@theme`, shadcn CSS vars, light/dark variants
- `cn()` utility (clsx + tailwind-merge)
- 16 shadcn wrappers: Button, Card, Dialog, Sheet, Command, Badge, Skeleton, Input, Label, Switch, Select, Slider, Tabs, Alert, Separator, Tooltip
- 7 domain primitives: MangaCard, EmptyState, LoadingState, ErrorState, SettingsSection, ReaderChrome, ThemePreview
- 106 tests passing

**Integration:**
- Tailwind CSS v4 wired in web app (`@tailwindcss/vite`)
- Design-system CSS imported in `__root.tsx`
- ThemeProvider with `.dark` class toggle
- Desktop app has `@app/design-system` and `@app/motion` deps

## New Canonical Commands

- Install deps: `pnpm install`
- Start web dev: `pnpm dev:web`
- Start desktop dev: `pnpm dev:desktop`
- Start default dev target: `pnpm dev` (web only)
- Lint: `pnpm lint`
- Lint fix: `pnpm lint:fix`
- Format: `pnpm format`
- Format check: `pnpm format:check`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Build all: `pnpm build`
- Build web: `pnpm --filter @app/web build`
- Build desktop: `pnpm --filter @app/desktop build`
- Clean: `pnpm clean`

These commands may change as the monorepo rewrite is implemented. Update this file and `docs/PLAN.md` when the canonical commands change.
