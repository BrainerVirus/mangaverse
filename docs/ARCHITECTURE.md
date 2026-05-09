# MangaVerse Rewrite Architecture

## Architecture Summary

MangaVerse will use a monorepo with app shells and reusable packages. The web app is built with TanStack Start. The desktop app is built with Electron and reuses the same web UI and core packages, adding desktop-only capabilities through `@app/platform` and an optional local Express service.

The architecture is local-first: package APIs read and write local SQLite first, then provider calls, cloud sync, and background refresh update local state asynchronously. App features consume stable package APIs and must not reach into provider internals, raw database internals, reader internals, or platform internals.

## Monorepo Structure

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

## Application Boundaries

### `apps/web`

- TanStack Start app shell.
- Owns routes, root providers, SSR/streaming configuration, hydration, web-only PWA setup, and web deployment config.
- Uses TanStack Router file-based routing.
- Uses TanStack Query through route loaders and feature hooks.
- Does not own business logic that should survive app shell replacement.

### `apps/desktop`

- Electron shell.
- Owns main process, preload scripts, app menu, custom protocol registration, native file dialogs, window controls, and desktop packaging.
- Reuses the web renderer where possible.
- Exposes desktop-only capabilities through `@app/platform` APIs, not direct Electron imports in feature packages.
- May run an Express service for local desktop APIs that benefit from an HTTP boundary, such as local file import/export, diagnostics, protocol install handoff, or isolated extension/network helpers.

## Package Boundaries

### `@app/shared`

Owns domain types and generic helpers used across packages.

Allowed contents:

- Domain model types.
- Result/error types.
- Constants.
- Logging interfaces.
- Validation helpers.
- Shared test fixtures.

Rules:

- Must not import from app shells or feature packages.
- Must not contain database, provider runtime, UI, or platform implementation details.

### `@app/db`

Owns all database schema, migrations, repositories, and data access APIs.

Responsibilities:

- Drizzle schema.
- SQLite migrations.
- Repository functions.
- Transaction helpers.
- Backup/export.
- Restore/import.
- Local-first persistence for library, identities, provider mappings, chapters, history, reader preferences, extension registry data, provider settings, global settings, theme preferences, migration history, tracking metadata, search history, recent reads, and cache metadata.

Rules:

- No raw SQL outside `@app/db` except tests or one-off migration internals inside the package.
- Feature packages call repositories or service APIs, not Drizzle tables directly unless explicitly exported as stable package API.
- Migrations must be append-only after release.

### `@app/platform`

Owns platform capability detection and adapters.

Responsibilities:

- Browser/PWA capability checks.
- Electron capability checks.
- File system abstraction.
- Deep link and custom protocol abstraction.
- Clipboard abstraction.
- Notification abstraction.
- Keep-awake abstraction where supported.
- Fullscreen abstraction.
- Install prompt abstraction.
- External link handling.
- Secure storage abstraction.
- SQLite driver selection and low-level storage capability exposure.

Rules:

- Features must not import Electron, browser-specific globals, or Node APIs directly.
- Desktop-only APIs must degrade cleanly on web.

### `@app/reader`

Standalone reader package for manga, comics, and webtoons.

Responsibilities:

- Reader layout engine.
- Page/spread calculation.
- Tap zone engine.
- Gesture and zoom orchestration.
- Keyboard navigation.
- Page preloading and decode queue.
- Reader chrome state integration points.
- Reader diagnostics.
- Reader-safe animation hooks.

Rules:

- Must not depend on app shell routing.
- Must not know provider internals.
- Must receive chapter/page data through stable input types.
- Must isolate high-frequency interactions from global app state.
- Must keep gesture, zoom, tap-zone, and scroll systems deterministic and testable.

### `@app/extensions-core`

Owns installed provider runtime and capability-aware provider calls.

Responsibilities:

- Provider install/uninstall/update.
- Manifest validation.
- Capability negotiation.
- Provider permissions.
- Provider settings.
- Provider health checks.
- Provider request handling and rate limits.
- Error normalization.
- Extension logs.
- Runtime security boundaries.

Rules:

- Provider-specific hacks stay here or in extension packages, never in app UI or feature packages.
- Provider calls must return normalized domain data or normalized errors.
- Capability checks must drive UI availability.

### `@app/extensions-sdk`

Public SDK for provider authors.

Responsibilities:

- Provider manifest schema.
- Provider contract types.
- Capability declarations.
- Request helpers.
- HTML parsing helpers.
- Rate-limit helpers.
- Error helpers.
- Test harness and mock providers.
- Author documentation.

Rules:

- SDK must not depend on app shell internals.
- SDK must version contracts explicitly.

### `@app/design-system`

Shared UI primitives, themes, layout rules, shadcn/ui wrappers, and accessibility conventions.

Responsibilities:

- Design tokens.
- Theme tokens.
- Typography rules.
- Layout primitives.
- shadcn/ui wrappers.
- App shell UI patterns.
- Manga cards.
- Settings patterns.
- Empty/loading/error states.
- Dialogs, sheets, drawers, command palette.
- Focus and accessibility conventions.
- Reader UI rules.

Rules:

- UI work must consume design-system components where available.
- Raw one-off styling must be justified by a missing primitive or a feature-specific layout need.

### `@app/motion`

Shared motion package built on GSAP.

Responsibilities:

- GSAP plugin registration.
- Shared animation presets.
- Route transition helpers.
- Entrance/exit helpers.
- Reduced-motion utilities.
- Timeline helpers.
- ScrollTrigger conventions.
- Reader-safe animation helpers.
- Animation cleanup helpers for React.
- Motion tokens consumed by design-system.

Rules:

- Must not contain business logic.
- GSAP code in React must use `useGSAP()` or an equivalent cleanup-safe wrapper.
- ScrollTrigger usage must be scoped and cleaned up on route/component unmount.

### Feature Packages

`@app/library`, `@app/search`, `@app/migration`, `@app/settings`, and `@app/theme` own feature-specific orchestration and UI built on stable lower-level package APIs.

Rules:

- Feature UI receives data through props or feature-level hooks.
- Feature packages must not import other feature packages directly unless a stable cross-feature domain package exists.
- Business logic belongs in feature services, domain packages, or `@app/db`, not in visual components.

### `@app/test-utils`

Owns shared test utilities, fixtures, fake providers, database test harnesses, and accessibility helpers.

## Dependency Rules

- App shells may import all packages.
- Feature packages may import `shared`, `db`, `platform`, `design-system`, `motion`, and relevant domain packages.
- `design-system` may import `motion` and `shared`, but not feature packages.
- `motion` may import GSAP and generic helpers, but not feature, db, provider, or app shell code.
- `db` may import `shared`, Drizzle, SQLite driver abstractions, and validation helpers.
- `extensions-core` may import `extensions-sdk`, `shared`, `db`, and `platform`.
- `extensions-sdk` should stay independent from app shell, db implementation, and UI.
- `reader` may import `shared`, `design-system`, and `motion` reader-safe helpers, but not app shell routes or provider internals.

## Data Flow

### Local-First Read Flow

- Route loader or feature hook requests data through a feature service.
- Feature service reads local SQLite through `@app/db` repositories.
- UI renders immediately from local data where available.
- TanStack Query optionally triggers provider refresh or background sync.
- Provider results are normalized and written to local SQLite.
- Query cache and local subscribed state update the UI.

### Mutation Flow

- UI calls a feature mutation.
- Mutation validates input and applies an optimistic local update when safe.
- Database write is performed through `@app/db`.
- Provider or sync side effects are queued or attempted asynchronously.
- On failure, optimistic update rolls back only where necessary and shows a clear recovery path.

### Reader Flow

- Manga detail or continue-reading flow resolves manga identity, provider mapping, chapter, and progress through package APIs.
- Reader receives normalized chapter pages and settings.
- Reader handles page layout, gestures, tap zones, zoom, preload, and progress events locally.
- Progress events are debounced or batched to `@app/db`.
- Reader never blocks navigation on persistence.

## Database Model

The initial Drizzle model should include:

- `manga_identities` for canonical internal manga records.
- `manga_provider_mappings` for provider/source mappings.
- `manga_titles` for canonical and alternate titles.
- `manga_people` for authors/artists.
- `manga_tags` and join tables.
- `library_entries` for user library state.
- `categories` and category membership.
- `chapters` normalized by provider mapping.
- `chapter_read_state` for read/unread and progress.
- `reading_history` for recent reads.
- `reader_preferences` for global and per-title settings.
- `extension_registries` and `installed_extensions`.
- `provider_settings`.
- `theme_preferences`.
- `app_settings`.
- `migration_jobs` and `migration_history`.
- `tracking_links`.
- `search_history` and saved searches.
- `cache_entries` and storage metadata.
- `sync_state` reserved for future cloud sync.

Important indexes:

- Library category and sort indexes.
- Provider mapping unique indexes.
- Chapter provider and number indexes.
- Read-state by manga/chapter indexes.
- History by read time.
- Search history by query/time.
- Cache metadata by provider, manga, chapter, and last access.

## Extension Runtime Model

The extension runtime should use a staged install process:

- Fetch manifest from user-provided URL or registry entry.
- Validate schema and app compatibility.
- Validate checksum/signature when provided.
- Show install confirmation with permissions and capabilities.
- Fetch provider code only after user confirmation.
- Store manifest, source URL, checksum, and install metadata.
- Load provider in the safest available runtime for the platform.
- Run health check.
- Enable provider only after successful validation.

Runtime safety layers:

- Manifest capabilities define what UI and APIs are enabled.
- Permissions are explicit and displayed.
- Provider code cannot access app internals directly.
- Requests pass through controlled request helpers for logging, rate limiting, headers, and cancellation.
- Broken providers can be disabled automatically or manually.
- Provider errors are normalized and isolated.

Browser sandboxing options must be resolved during implementation. The first acceptable implementation may use worker-based isolation with strict APIs, but the architecture must leave room for stronger sandboxing.

## Extension SDK Model

Provider authors implement a typed provider contract and manifest. The SDK validates provider shape and supports contract tests.

Provider methods should be optional by capability:

- `search`
- `advancedSearch`
- `browseLatest`
- `browsePopular`
- `getDetails`
- `getChapters`
- `getPages`
- `getRecommendations`
- `getRelatedTitles`
- `getTags`
- `login`
- `logout`
- `getDownloadInfo`

The app must never assume a method exists without checking provider capabilities.

## Provider Capability Model

Capabilities are structured data, not booleans scattered through UI. Capabilities should describe support, filters, limits, auth requirements, content warnings, and known restrictions.

Example categories:

- Discovery capabilities.
- Search capabilities.
- Metadata capabilities.
- Chapter/page capabilities.
- Auth capabilities.
- Content rating capabilities.
- Recommendation capabilities.
- Download/cache capabilities.
- Tracking capabilities.
- Reliability limitations.

## Security Model

- Third-party provider distribution is separate from the core app.
- Provider install requires explicit user action.
- Manifest validation is mandatory.
- Permissions and capabilities are visible before install.
- Provider code cannot import app internals.
- Desktop APIs are not available to provider code by default.
- Electron renderer must not expose broad Node access.
- Preload scripts expose narrow, typed APIs.
- External links open safely through platform abstraction.
- Sensitive tokens use platform secure storage where available.
- Provider authentication is isolated per provider.
- Logs must not leak credentials.
- Cloud sync is opt-in and must not upload provider secrets without explicit rules.

## Reader Architecture

Reader should be split into small systems:

- Reader state model.
- Page source adapter.
- Layout engine.
- Spread engine.
- Tap zone engine.
- Gesture/zoom engine.
- Keyboard and wheel navigation.
- Preload/decode queue.
- Progress persistence adapter.
- Reader chrome controller.
- Diagnostics collector.
- Reader-safe motion adapter.

High-frequency state such as pointer movement, zoom transforms, scroll position, and active gesture data should not live in global Zustand stores. Persisted state should be debounced or committed at stable checkpoints.

Tap zones must be computed against the visible reader interaction layer, not raw image dimensions. They must account for chrome overlays, zoom state, scroll mode, and disabled navigation modes.

## Motion Architecture

`@app/motion` registers GSAP plugins once and exports safe helpers. React components use `useGSAP()` with a scope ref. Event callbacks that create animations must be wrapped with `contextSafe()` or package helpers that provide equivalent cleanup.

Motion categories:

- Route transitions.
- Content reveal.
- Microinteractions.
- Feedback/success states.
- Theme transitions.
- Command palette transitions.
- Reader-safe chrome transitions.
- ScrollTrigger experiences outside the reader.

Reader-safe motion is restricted to chrome opacity/position, page transition options that do not break gestures, and low-cost state feedback. ScrollTrigger must not control core reader scrolling unless explicitly designed and tested for webtoon mode.

## TanStack Start And Router Architecture

- Use TanStack Start for web app framework.
- Use TanStack Router file-based routes.
- Use validated search params for filters, search, settings subsections, and provider selectors.
- Use route loaders for critical local data.
- Use `defaultPreload: 'intent'` for navigation where appropriate.
- Keep route files thin; route files compose feature screens and loaders.
- Code-split large feature screens and settings sections.

## TanStack Query Architecture

- Use query key factories or typed query options per package.
- Local-first data should be loaded from SQLite through repositories.
- Provider calls should use Query for cancellation, retries, stale times, and caching.
- Optimistic updates must snapshot previous data and rollback when needed.
- Provider refresh queries should support partial failures.
- Search aggregation should run providers in parallel and update results incrementally.
- Use `networkMode: 'offlineFirst'` or `always` only where behavior is understood and tested.

## Zustand Architecture

Use Zustand for client/UI state that is not naturally server/provider state:

- App shell state.
- Command palette state.
- Temporary filters before commit.
- Reader chrome visibility when local to shell.
- User preference cache hydrated from DB.
- Theme selection state.

Avoid putting provider response data, database rows, or high-frequency reader interaction state directly in global stores.

## Express In Electron

Express may be used in the Electron app for desktop-local APIs when beneficial:

- Local backup import/export.
- Diagnostics bundle generation.
- Local file serving for cached chapters if safer than direct file paths.
- Protocol install handoff.
- Extension worker/proxy experiments.

Rules:

- Express must bind only to localhost or an internal channel.
- Endpoints must validate input.
- Endpoints must not expose arbitrary file access.
- Web app code must call these capabilities through `@app/platform`, not hardcoded URLs.

## Cloud Sync Architecture

Cloud sync is a later phase. Supabase is a candidate, not an initial dependency of local correctness.

Sync principles:

- Local data remains source of immediate UI truth.
- Sync uses explicit `sync_state` metadata.
- Conflicts are detected and surfaced.
- Provider distribution remains separate.
- Installed extension lists may sync as metadata, but provider code and credentials require separate explicit policy.
- Reader progress and library changes should sync incrementally.

## Migration From Current Codebase

Use the current app as source material for:

- Feature inventory.
- Existing settings names and behavior.
- Current provider contract lessons.
- Existing database table ideas.
- Known reader problems, especially tap zone reliability.
- Current themes and visual language candidates.

Do not preserve unstable code solely for parity. Move behavior into new packages only after writing package contracts and tests.
