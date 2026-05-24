# MangaVerse Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` when implementing this plan task-by-task. Steps in this document are phase gates and planning tasks; implementation tasks should be expanded into smaller TDD plans before code is written.

**Goal:** Continue the migration as a clean web-native and Electron desktop rewrite with reusable core packages, local-first architecture, Drizzle SQLite, safe extensions, premium design, and a robust reader.

**Architecture:** Build a monorepo with TanStack Start web app, Electron desktop app, and stable package APIs. Feature packages consume `@app/db`, `@app/extensions-core`, `@app/reader`, `@app/platform`, `@app/design-system`, and `@app/motion` instead of reaching into internals.

**Tech Stack:** React, React Compiler, TypeScript, TanStack Start, TanStack Router, TanStack Query, Zustand, Drizzle ORM, SQLite, Electron, Express, shadcn/ui, GSAP, `@gsap/react`, ScrollTrigger.

---

## Planning Rules

- Do not rescue failing Expo migration code unless a specific behavior is needed as reference.
- Do not write implementation code without checking `SPEC.md`, `ARCHITECTURE.md`, and `Design.md` for relevant constraints.
- Before each phase, create a focused implementation plan with test cases and exact files.
- Prefer small package contracts and tests before UI.
- Keep local-first behavior as an architecture requirement, not a later optimization.
- Treat cloud sync as a later phase after local correctness, backup, restore, and identities are stable.

## Phase 0: Documentation Foundation

### Deliverables

- `docs/SPEC.md`
- `docs/PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/Design.md`
- root `AGENTS.md` updated to reference the docs.

### Acceptance Criteria

- Docs define product goals, architecture, design system, implementation phases, and agent rules.
- AGENTS requires reading the correct docs before implementing behavior, package boundaries, UI, or task selection.
- Old Expo/Tauri assumptions are clearly superseded for the rewrite.

### Testing Gate

- Markdown files exist and are readable.
- No implementation code is required in this phase.

## Phase 1: Monorepo Foundation

### Goals

- Establish the new repo structure without porting feature code prematurely.
- Add workspace package management and shared TypeScript/lint/test configuration.

### Tasks

- Choose workspace manager and package naming convention.
- Create `apps/web` TanStack Start source app.
- Create `apps/desktop` Electron source app.
- Create package directories with minimal `package.json`, `tsconfig.json`, and test setup.
- Configure shared TypeScript strictness.
- Configure linting and formatting for apps and packages.
- Configure test runner for package-level unit tests.
- Add path aliases for package imports.
- Add CI scripts for lint, typecheck, test, and build.

### Acceptance Criteria

- `apps/web` can start with a minimal TanStack Start route.
- `apps/desktop` can open the renderer in Electron.
- Packages can compile independently.
- CI commands are documented.

### Phase 1.1 Correction Gate

Phase 1 is not accepted until the web app uses TanStack Start, Electron postinstall is allowlisted and verified, package builds emit real `dist` outputs, `pnpm-lock.yaml` is tracked, CI uses pnpm 11, and lint/typecheck/test/build pass for the new monorepo scope.

Current TanStack Start uses Vite plus Nitro for SSR output. Nitro is an app framework adapter, not a MangaVerse feature package, and should remain isolated to `apps/web`/desktop renderer packaging.

### Testing Gate

- Run lint.
- Run typecheck.
- Run package unit test command.
- Run minimal web build.
- Run minimal desktop dev smoke test if practical.

## Phase 2: Core Domain Models

### Goals

- Define stable domain types before database and UI implementation.

### Tasks

- Define manga identity model.
- Define provider manifest and capability model.
- Define chapter, page, and read-state models.
- Define reader settings model.
- Define library entry and category models.
- Define extension install metadata model.
- Define backup schema model.
- Define normalized error/result types.

### Acceptance Criteria

- Domain types live in `@app/shared` or the owning package.
- Provider capability checks can be expressed without provider-specific UI hacks.
- Manga identity can represent multiple provider mappings.
- Reader settings can represent global and per-title overrides.

### Testing Gate

- Unit tests for validation helpers and default settings.
- Type-level tests for important provider capability shapes if tooling supports it.

## Phase 3: Database Package

### Goals

- Build `@app/db` with Drizzle ORM, SQLite schema, migrations, repositories, and backup foundations.

### Tasks

- Select SQLite driver strategy for browser and Electron.
- Add Drizzle configuration.
- Define schema tables and indexes.
- Add migration runner.
- Implement repository APIs for identities, library, chapters, read state, settings, extensions, search history, migration history, and cache metadata.
- Add transaction helpers.
- Add backup export serializer.
- Add restore validation and preview foundation.

### Acceptance Criteria

- No feature package needs raw SQL.
- Repositories support local-first critical reads.
- Schema supports duplicate manga identity mapping and provider switching.
- Backup export can serialize core local data.

### Testing Gate

- Integration tests with an in-memory SQLite database.
- Migration tests from empty DB to latest schema.
- Repository tests for library identity merge/unmerge basics.
- Backup export and restore preview tests.

## Phase 4: Platform Package

### Goals

- Hide browser, PWA, and Electron capability differences behind stable APIs.

### Tasks

- Define platform capability model.
- Implement web storage, file import/export fallbacks, fullscreen, clipboard, protocol support detection, install prompt, and external link handling.
- Implement Electron adapters for file dialogs, custom protocol handoff, native fullscreen, app paths, secure storage where possible, and diagnostics.
- Define Express local service boundary for desktop-only APIs.

### Acceptance Criteria

- Feature packages call `@app/platform`, not browser/Electron APIs.
- Web fallback flows are explicit.
- Desktop-only capabilities are discoverable through capability checks.

### Testing Gate

- Unit tests for capability detection.
- Adapter contract tests with mocked web and Electron environments.

## Phase 5: Extensions Core And SDK

### Goals

- Build safe provider install/runtime foundation and official SDK.

### Tasks

- Define manifest schema.
- Define provider contract and capabilities.
- Implement manifest validation.
- Implement install flow state machine.
- Implement provider registry import.
- Implement manual URL install path.
- Implement Electron custom protocol install handoff.
- Implement provider settings model.
- Implement request helpers, rate limit helpers, parsing helpers, and error normalization.
- Add test harness and mock providers.

### Acceptance Criteria

- App can validate provider metadata before install.
- Capabilities and permissions are visible before install.
- Provider distribution remains external to core app.
- Mock providers can pass SDK contract tests.

### Testing Gate

- Contract tests for mock providers.
- Manifest validation tests.
- Install state machine tests.
- Permission/capability display data tests.
- Broken provider isolation tests.

## Phase 6: Reader Package

### Goals

- Build a standalone, robust reader that fixes current tap-zone and gesture reliability issues.

### Tasks

- Define reader input/output contract.
- Implement reader state model.
- Implement page layout and spread engine.
- Implement cover-aware smart spread rules.
- Implement tap zone engine with debug overlay.
- Implement keyboard navigation.
- Implement pointer/touch navigation.
- Implement zoom and pan system.
- Implement webtoon mode with virtualization strategy for long chapters.
- Implement preloading and decode queue.
- Implement progress events and persistence adapter.
- Implement error/retry states.
- Implement low-memory mode.
- Implement diagnostics.

### Acceptance Criteria

- Reader works independently from app shell.
- Tap zones remain reliable with zoom, overlays, and scroll mode.
- Reader interactions do not cause app-wide rerenders.
- Reader supports RTL, LTR, and webtoon modes.

### Testing Gate

- Unit tests for spread calculation.
- Unit tests for tap zone calculation.
- Interaction tests for keyboard and tap navigation.
- Gesture/zoom tests where tooling allows.
- Performance smoke test for long webtoon chapters.

## Phase 7: Design System And Motion System

### Goals

- Build the shared UI and motion foundation before feature pages.

### Tasks

- Initialize shadcn/ui in the web stack.
- Define theme tokens and CSS variables.
- Build design-system wrappers for common primitives.
- Build manga card, empty state, loading state, error state, settings section, dialog, sheet, command palette, and reader chrome primitives.
- Add GSAP registration and shared motion presets.
- Add reduced-motion utilities.
- Add route transition helpers.
- Add reader-safe animation helpers.
- Add theme preview components.

### Acceptance Criteria

- UI work can use design-system primitives instead of one-off styling.
- Motion tokens match `Design.md`.
- GSAP cleanup rules are encoded in package helpers.
- Reduced motion is supported centrally.

### Testing Gate

- Component tests for primitives.
- Accessibility tests for dialogs, sheets, command palette, settings controls, and reader chrome.
- Reduced-motion tests for motion helpers.

## Phase 8: App Shell

### Goals

- Build the navigable web and desktop shell around package APIs.

### Tasks

- Create TanStack Router route structure.
- Add root providers for Query, theme, platform, and app state.
- Add app shell layouts for desktop, tablet, and mobile.
- Add command palette.
- Add navigation preloading.
- Add route transitions.
- Add diagnostics route shell.
- Wire Electron renderer to desktop platform APIs.

### Acceptance Criteria

- App shell supports keyboard-first desktop usage.
- Routes are lazy-loaded where appropriate.
- Navigation is fast and cache-aware.
- Desktop and web capability differences are visible only through platform APIs.

### Testing Gate

- Router tests for critical navigation.
- Command palette keyboard tests.
- Shell accessibility smoke tests.
- Desktop renderer smoke test.

## Phase 9: Feature Pages

### Goals

- Implement user-facing flows using the package foundations.

### Tasks

- Library page.
- Search/explore page.
- Manga detail page.
- Reader route integration.
- Extension manager.
- Provider settings.
- Global settings.
- Reader settings.
- Theme customization.
- Backup and restore.
- Migration tool.
- Storage management.
- About/diagnostics.
- Onboarding.

### Acceptance Criteria

- Critical flows from `SPEC.md` are usable locally.
- Broken providers show partial failures and retry options.
- Manga identity model prevents duplicate library entries when mappings can be merged.
- Settings are deep but organized.

### Testing Gate

- Basic E2E flows for add provider, search, add manga, read, continue, migrate, backup, restore, and theme change.
- Accessibility tests for primary flows.
- Search aggregation tests.
- Migration safety tests.

## Phase 10: Local-First Performance Pass

### Goals

- Make the app feel nearly instant.

### Tasks

- Add query key factories and prefetch conventions.
- Tune TanStack Query stale times and cache times by feature.
- Add route intent preloading.
- Add optimistic update patterns for library actions, read state, provider settings, and theme changes.
- Add virtualization for library grids, search results, chapter lists, and long reader lists.
- Add image preload/decode instrumentation.
- Add provider latency tracking.
- Add low-memory behavior.

### Acceptance Criteria

- Library and settings interactions feel instant.
- Reader interactions remain stable under load.
- Search shows incremental results and partial failures.
- Slow provider calls do not block local UI.

### Testing Gate

- Performance smoke tests for large libraries and long chapters.
- Query cancellation tests.
- Optimistic rollback tests.
- Memory behavior manual test on constrained browser profile.

## Phase 10.5: App Stability And Repo Cleanup

### Goals

- Fix SSR/hydration mismatches and Electron dev warnings before polish work.
- Remove superseded Expo, React Native, and Tauri legacy trees from the monorepo root.

### Tasks

- Fix `AppShellLayout` hydration by using CSS breakpoints for shell chrome instead of client-only device detection on first paint.
- Add Electron Content-Security-Policy headers (dev allows Vite HMR; production stays strict).
- Move route tests out of `apps/web/app/routes/` so TanStack Router file scanning ignores them.
- Remove duplicate Nitro/Vite SSR entry configuration and adopt Vite native `resolve.tsconfigPaths`.
- Delete legacy Expo Router app, NativeWind, root services/stores, bundled `extensions/`, and `src-tauri/`.
- Slim root `package.json` to monorepo scripts and dev tooling only.

### Acceptance Criteria

- No hydration mismatch in Electron or web shell on first load.
- Electron dev console no longer warns about missing CSP.
- Route tree generation excludes test files.
- Legacy Expo/Tauri code paths are removed; monorepo apps/packages remain intact.
- Lint, typecheck, test, and build pass.

### Testing Gate

- Shell layout SSR test still passes.
- Desktop CSP unit tests pass.
- Full CI pipeline green.

### Known benign noise

- Chromium/Electron DevTools Autofill protocol errors are harmless and can be ignored during local dev.

## Phase 11: Polish And Premium Experience

### Goals

- Add the wow effect without harming the reader.

### Tasks

- Polish onboarding motion.
- Polish library reveal and hover/focus states.
- Polish search result reveal.
- Polish extension install confirmation.
- Polish migration review flow.
- Polish backup/restore success states.
- Polish theme switching.
- Polish desktop command palette and window treatment.
- Add theme-specific visual details.

### Acceptance Criteria

- Motion has functional purpose.
- Reduced-motion mode remains calm and usable.
- Reader remains distraction-free by default.
- Themes feel distinct without breaking consistency or accessibility.

### Testing Gate

- Reduced-motion manual and automated checks.
- Accessibility pass on polished screens.
- Reader performance regression check.

## Phase 12: Cloud Sync Exploration

### Goals

- Explore user accounts and sync without compromising local-first behavior.

### Tasks

- Define sync requirements and conflict rules.
- Evaluate Supabase schema and auth fit.
- Define syncable vs local-only data.
- Prototype progress sync.
- Prototype library/settings sync.
- Define provider credential policy.
- Define missing extension restore behavior.

### Acceptance Criteria

- Sync is opt-in.
- Local app works fully without cloud.
- Conflicts are explicit.
- Provider distribution remains separate.

### Testing Gate

- Sync conflict tests.
- Offline/online transition tests.
- Account sign-in/out data isolation tests.

## Migration Strategy From Current Codebase

- Inventory current screens, stores, provider contract, DB schema, reader settings, and themes.
- Mark each item as reuse, redesign, or discard.
- Reuse concepts and behavior, not unstable implementation.
- Port only after package contracts and tests exist.
- Keep old Expo code separate until replacement flows pass tests.
- Delete old code only after equivalent new flow is accepted.

## Risk Areas

- Browser SQLite persistence and storage quotas.
- Electron security and preload API scope.
- Extension sandboxing limitations.
- Provider scraping breakage and anti-bot behavior.
- Tap zone reliability with zoom and overlays.
- Long webtoon chapter memory usage.
- Drizzle driver differences between browser and desktop.
- Cloud sync conflict complexity.
- Motion overuse hurting reader performance.
- Legal/takedown risk from bundled third-party providers.

## Global Testing Gates

Before considering a phase complete:

- Lint passes.
- Typecheck passes.
- Relevant unit tests pass.
- Relevant integration tests pass.
- Accessibility checks pass for changed UI.
- Reduced-motion behavior is checked for motion work.
- Reader performance is checked for reader-impacting changes.
- Package boundary rules are reviewed.
