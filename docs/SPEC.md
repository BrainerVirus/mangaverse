# MangaVerse Rewrite Specification

## Purpose

MangaVerse is being rewritten from an Expo-first app into a web-native, local-first manga, comic, and webtoon reader that can also ship as a desktop app for Windows, macOS, and Linux. The rewrite should preserve the strongest product ideas from the current app while replacing unstable architecture with reusable packages, clear boundaries, safe extension loading, robust reader behavior, and a premium user experience.

The current Expo codebase is feature inventory and migration reference. It is not the implementation target.

## Product Goals

- Deliver a fast, polished, customizable manga, comic, and webtoon reader.
- Prioritize calm, reliable reading while making discovery, onboarding, library browsing, theme switching, and extension flows feel premium.
- Build reusable core packages that can survive app shell replacement.
- Support local-first usage on web and desktop, with cloud sync added after core local flows are stable.
- Keep third-party provider distribution separate from the core app to reduce legal and takedown risk.
- Provide deep power-user controls without overwhelming casual users.
- Use spec-driven development for all major implementation work.

## Target Users

- Casual readers who want to add a source, search, read, and continue later with minimal friction.
- Power users who want provider control, reader customization, migration tools, backups, tracking, and diagnostics.
- Desktop-first users who expect keyboard navigation, command palette, local files, fullscreen reading, and native import/export.
- Mobile web/PWA users who want fast reading and continuity without a dedicated native app.
- Extension authors who need a documented SDK, stable provider contract, test harness, and validation rules.

## Reference Products

- Mihon and Tachiyomi for reader settings, library organization, migration, backups, source/provider concepts, and power-user expectations.
- Paperback for iOS extension and scripting model inspiration.
- Suwayomi for cross-platform Tachiyomi/Mihon-compatible architecture ideas.
- `piro0919/react-comic-viewer` as a React-based reader reference, not as the feature ceiling.
- GSAP documentation for React-safe animation via `@gsap/react`, `useGSAP()`, timelines, and ScrollTrigger.

## Target Platforms

- Web app built with React and TanStack Start.
- PWA installability where browser support allows it.
- Electron desktop app for Windows, macOS, and Linux.
- Browser and desktop capability differences hidden behind `@app/platform`.
- Mobile web support is required; native mobile is legacy and not a primary rewrite target.

## Required Stack

- React latest stable version available to the project.
- React Compiler where compatible with dependencies and build tooling.
- TypeScript throughout apps and packages.
- TanStack Start as the web framework.
- TanStack Router for routing.
- TanStack Query for remote/server-state and provider-call caching.
- Zustand for client-side UI and preference state.
- Drizzle ORM for SQLite schema, migrations, and typed queries.
- SQLite as the local database.
- Browser SQLite through WASM for web/PWA.
- Electron desktop SQLite through a native or Node-compatible driver chosen during implementation.
- Express.js in the Electron app for local desktop-only APIs when an HTTP boundary is useful.
- shadcn/ui for accessible UI primitives and component composition.
- GSAP, `@gsap/react`, timelines, and ScrollTrigger for motion.
- Monorepo package layout.

## Product Principles

- Reading comes first.
- Discovery should feel exciting.
- Power-user features should be available but not visually overwhelming.
- Motion should guide, not distract.
- The reader must stay calm, fast, and stable.
- Settings should be deep but organized.
- Provider complexity should be hidden until needed.
- The app should feel premium on mobile, web, and desktop.
- Accessibility is not optional.
- Every visual effect must have a purpose.

## Core User Flows

### Onboarding

- User launches the app for the first time.
- App explains local-first storage, extension safety, content responsibility, and optional cloud sync later.
- User chooses theme, reading defaults, language/content preferences, and initial provider installation path.
- Onboarding is skippable but resumable from settings.

### Install Provider

- User opens a provider install link or registry page.
- App validates manifest, compatibility, checksum/signature if available, capabilities, permissions, and source URL.
- App shows a confirmation screen with provider name, version, publisher/source, capabilities, permissions, supported languages, NSFW flag, and warnings.
- User confirms installation.
- Provider becomes available only after successful validation and explicit user consent.

### Search And Add Manga

- User searches globally across enabled providers or within one provider.
- App shows fast local UI feedback, provider-specific loading states, partial failures, retry actions, and attribution.
- User opens a result, reviews details, chooses provider mapping if needed, and adds to library.
- If a matching manga identity exists, the app attaches a provider mapping instead of duplicating the library item.

### Read Manga

- User opens a manga and starts or continues a chapter.
- Reader loads with last progress, page preloading, error recovery, and reader-specific settings.
- User navigates with tap zones, keyboard, gestures, wheel, or controls depending on platform and mode.
- Reader persists progress, read state, and resume position without blocking interactions.

### Customize Reader

- User changes global reader settings from settings or reader controls.
- User can override settings per title.
- App clearly distinguishes inherited global values from per-title overrides.
- User can reset overrides by scope.

### Migrate Provider

- User starts single-title or batch migration.
- App searches target providers, scores matches, and shows a review screen.
- User confirms selected matches before changes are applied.
- App preserves reading progress, library state, categories, tracking links where possible, reader settings, and user overrides.
- App reports warnings, skipped items, and rollback options where feasible.

### Backup And Restore

- User exports a backup file containing library, categories, progress, read states, settings, providers, installed extension list, identities, and migration history.
- User imports a backup file.
- App validates backup format and shows restore preview with conflicts and missing provider warnings.
- Destructive restore requires explicit confirmation.

### Optional Cloud Sync

- User signs into a cloud account after local flows are stable.
- App syncs library, progress, settings, identities, and installed provider list metadata where safe.
- Sync does not require bundling third-party providers in the core app.
- Conflict resolution is explicit and safe.

## Functional Requirements

### Reader

The reader package must be standalone and usable outside the app shell.

It must support:

- RTL manga paging.
- LTR comic paging.
- Vertical/webtoon scrolling.
- Single-page mode.
- Double-page/spread mode.
- Smart spread detection.
- Cover-page handling so covers do not break spreads.
- Fit width, fit height, contain, cover, and original-size modes.
- Desktop keyboard navigation.
- Mobile touch navigation.
- Configurable tap zones.
- Tap zone debug overlay.
- Tap zones that remain reliable with zoom, scroll, overlays, and reader chrome.
- Pinch-to-zoom.
- Double-tap zoom.
- Pan while zoomed.
- Reader-safe page transition animations.
- Optional thumbnails or filmstrip.
- Page indicator.
- Fullscreen mode.
- Reading progress persistence.
- Next/previous page preloading.
- Image decode/preload queue.
- Error states for failed images.
- Retry support.
- Global reader settings.
- Per-series reader settings.
- Accessibility-friendly controls.
- Chapter transition screen.
- Next and previous chapter loading.
- Resume from last page.
- Mark chapter as read or unread.
- Mark previous chapters as read.
- Optional page cache.
- Low-memory mode.
- Reader performance diagnostics.

### Reader Settings

Reader settings must include:

- Reading mode: RTL manga, LTR comic, vertical/webtoon.
- Page layout: single page, double page, smart spread.
- Fit mode: width, height, contain, cover, original.
- Tap zones and tap zone overlay.
- Navigation direction.
- Page transitions.
- Background color.
- Spacing between webtoon pages.
- Image smoothing.
- Preload amount.
- Keep-awake where supported.
- Fullscreen behavior.
- Keyboard shortcuts and shortcut editor.
- Mouse wheel behavior.
- Reader chrome visibility.
- Gesture sensitivity.
- Double-tap zoom level.
- Pinch zoom sensitivity.
- Webtoon page gap.
- Long-strip optimization.
- Low-memory mode.
- Remember per-title overrides.
- Reset per-title overrides.
- Reader diagnostics.

### Extensions Core

The extensions runtime must provide:

- Universal provider API.
- Provider metadata and manifests.
- Provider capabilities.
- Provider installation, uninstallation, and updating.
- Provider health checks.
- Provider settings.
- Provider permissions.
- Provider version compatibility.
- Search, advanced search, browse, details, chapters, pages.
- Recommendations and related manga when supported.
- Tags, genres, languages, and content ratings when supported.
- Rate limiting and request handling.
- Error normalization.
- Extension logs.
- Security boundaries.
- Capability negotiation.

Provider capabilities must include support for search, advanced search, latest, popular, details, chapter list, page list, recommendations, related titles, tags, languages, NSFW/content rating, authentication, anti-bot limitations, downloads, tracking integration, official API mode, and scraping mode.

### Extensions SDK

The SDK must support official API providers and scraping providers through the same standard contract.

It must include:

- TypeScript types.
- Manifest schema.
- Capability declarations.
- Validation helpers.
- Request helpers.
- HTML parsing helpers.
- Rate-limit helpers.
- Error helpers.
- Test harness.
- Mock provider examples.
- Provider author documentation.
- Version compatibility rules.
- Recommended extension project structure.

### Extension Installation

The app must support three install paths:

- Electron custom protocol, for example `myreader://install-extension?url=https%3A%2F%2Fexample.com%2Fprovider.json`.
- Browser/PWA protocol handler where supported.
- Universal fallback with manual URL paste or import from a registry page.

Safety requirements:

- Do not bundle third-party source extensions by default unless explicitly approved.
- Allow user-provided extension registries.
- Require explicit confirmation before installing provider code.
- Show capabilities and permissions before install.
- Validate extension manifests.
- Support checksums or signatures where feasible.
- Support disabling broken or dangerous providers.
- Keep provider distribution separate from the app shell.
- Allow manual install from URL.
- Allow import/export of installed extension lists.

### Provider Settings

Provider settings must support:

- Enable/disable provider.
- Preferred languages.
- NSFW on/off.
- Excluded tags.
- Included tags.
- Content rating filters.
- Region or locale when supported.
- Authentication settings when supported.
- Provider-specific options.
- Provider-specific rate limits where appropriate.
- Provider-specific default sort where supported.
- Provider-specific search behavior where supported.

Settings must affect search, browse, recommendations, updates, library refresh, migration search, and related title discovery. Unsupported settings must not be shown as available.

### Library

The library must support:

- Grid, list, and compact layouts.
- Categories.
- Sorting and filtering.
- Search within library.
- Continue reading.
- Recently updated.
- Reading status.
- Favorites.
- Per-title progress.
- Unread chapter counts.
- Last read chapter.
- Last updated time.
- Cover management.
- Duplicate/title matching across providers.
- Unified manga identity model.
- Bulk editing.
- Bulk category assignment.
- Bulk migration.
- Custom covers.
- Pinned categories.
- Failed update report.
- Library update queue.

When the same manga exists on multiple providers, the user should see one library item with multiple provider mappings. The user must be able to choose a default provider and switch providers from the manga detail page.

### Manga Identity Model

The universal identity model must support:

- Internal app manga ID.
- One or more provider mappings.
- Provider manga IDs.
- Canonical title.
- Alternative titles.
- Authors and artists.
- Description.
- Cover.
- Tags.
- Status.
- Content rating.
- Language.
- Default provider.
- Preferred chapter source.
- Tracking links.
- User overrides.
- Merge/unmerge state.

### Manga Detail Page

The detail page must support:

- Cover, title, alternative titles, author, artist, description, tags, status, content rating.
- Provider/source indicator.
- Provider switcher when multiple mappings are attached.
- Add/remove from library.
- Start reading and continue reading.
- Chapter list sorting and filtering.
- Read/unread state.
- Download/cache state if supported.
- Tracking status if supported.
- Recommendations and related titles if supported.
- Migration action.
- Provider settings shortcut.
- Per-title reader settings.

### Search And Discovery

Search must support:

- Global search across enabled providers.
- Provider-specific search.
- Advanced filters where supported.
- Language filters.
- Include and exclude tag filters.
- NSFW/content rating filters.
- Sort options where supported.
- Capability-aware UI.
- Empty, loading, error, and partial failure states.
- Deduplication when possible.
- Provider attribution.
- Independent retry for failed providers.
- Recent searches.
- Saved searches.
- Browse latest, popular, tag, provider.
- Recommendations and related manga where supported.

Slow, broken, or limited providers must not break the full page.

### Migration

Migration must support:

- Single-title migration.
- Batch migration.
- Target provider search.
- Match confidence scoring.
- Manual review before apply.
- Preservation of progress, categories, favorite/library state, tracking links where possible, reader settings, and user overrides.
- Warnings for downloaded chapters and provider-specific data that may not migrate cleanly.
- Backup recommendation before major migrations.
- Summary before apply.
- Report after apply.
- Rollback where feasible.

Large migrations must never silently replace library state.

### Themes

The app must ship with visually distinct themes:

- Minimal light.
- Minimal dark.
- Vercel-inspired monochrome.
- Sakura.
- Cyberpunk.
- AMOLED black.
- Warm paper.
- High contrast.
- System theme.

The theme system must support design tokens, light/dark variants, accent colors, radius scale, typography scale, surface colors, reader backgrounds, persistence, theme previews, future custom themes, animated theme switching, and per-theme motion intensity where appropriate.

### Motion

Motion must be part of the design system, not decorative afterthought.

GSAP should be used for:

- Onboarding.
- Route transitions.
- Library grid reveal.
- Manga card hover/focus interactions.
- Reader chrome show/hide.
- Reader mode transitions.
- Theme switching.
- Extension install confirmation.
- Empty states.
- Search result reveal.
- Settings panel transitions.
- Desktop command palette.
- Webtoon scroll enhancements where appropriate.
- Provider install flow.
- Migration review flow.
- Backup/restore success states.

Motion constraints:

- Reader performance must not be compromised.
- GSAP must not interfere with scroll, gestures, tap zones, zoom, or page preloading.
- Avoid excessive animation during reading.
- Respect `prefers-reduced-motion`.
- Every animation must provide orientation, feedback, continuity, hierarchy, or delight.
- Animation logic must be isolated from business logic.
- Shared motion patterns live in `@app/motion` or `@app/design-system`.

### Backup And Restore

Backups must include:

- Library.
- Categories.
- Reading progress.
- Read/unread chapters.
- Reader settings.
- Provider settings.
- Installed extension list.
- Theme settings.
- App settings.
- Tracking metadata where feasible.
- Manga identity mappings.
- Migration history where useful.

Backup/restore must support manual export/import, validation, restore preview, conflict handling, destructive action warnings, and optional automatic backup if feasible.

### Tracking

The architecture must allow tracking services later without hardcoding one provider. Future tracking may include read chapter sync, score/rating, reading status, start/finish dates, re-read count, external links, and provider-to-tracker matching.

### Offline And Cache

The app should support:

- Recently read chapter cache.
- Optional manual chapter download/cache where feasible.
- Clear cache.
- Storage usage page.
- Per-provider cache size.
- Failed image retry.
- Cache corruption handling.
- Documented PWA limitations.
- Documented desktop file system advantages.

### Desktop

Electron desktop must support:

- Custom protocol links for extension install.
- Native file import/export where possible.
- Better storage handling where possible.
- Keyboard-first navigation.
- Command palette.
- Window controls that fit the design system.
- Fullscreen reader.
- External link handling.
- Local backup files.
- Diagnostics.
- Local Express service only for desktop capabilities that should not leak into web code.

### Web/PWA

Web/PWA must support:

- Installability where supported.
- Browser-safe storage.
- Manual extension URL import fallback.
- Protocol handler support where supported.
- Clear messaging when browser capabilities are unavailable.
- Responsive layout.
- Mobile gestures.
- Desktop browser keyboard shortcuts.
- Progressive enhancement.

Critical flows must not depend solely on browser protocol handlers.

## Local-First Performance Requirements

- Startup must be fast.
- Local reads should come from SQLite or local cache first.
- Remote/provider calls should hydrate local state asynchronously.
- App should feel instant through optimistic updates, prefetching, and cache-aware navigation.
- TanStack Router should use intent preloading where useful.
- TanStack Query should use explicit query keys, sensible stale times, cancellation, and optimistic updates.
- Long lists must be virtualized.
- Large feature areas must be lazy-loaded.
- Reader rendering must be isolated from app shell rerenders.
- Page preloading must be intelligent and memory-aware.
- Provider calls must be tracked for latency and failure.
- Extension parsing must not block the main thread when avoidable.
- Database indexes must support common library, chapter, identity, search history, and provider mapping queries.
- Low-memory mode must reduce preloading, thumbnails, cache pressure, and animation intensity.

## Accessibility Requirements

- Keyboard navigation.
- Screen-reader-friendly labels.
- Visible focus states.
- Reduced motion.
- Sufficient color contrast.
- Large touch targets.
- Clear error messages.
- Keyboard-accessible reader controls.
- Dialog focus trapping.
- Escape-to-close where appropriate.
- Non-color-only status indicators.
- High contrast theme.
- Focus must not be obscured by sticky chrome or overlays.

## Testing Requirements

Testing strategy must include:

- Unit tests for pure packages.
- Integration tests for DB repositories.
- Contract tests for provider SDK.
- Reader interaction tests.
- Tap zone tests.
- Reader mode tests.
- Migration tests.
- Search aggregation tests.
- Theme tests.
- Accessibility tests.
- Basic E2E flows.

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

## Platform Constraints

- Browser storage quotas vary by browser and device.
- PWA protocol handler support is limited and cannot be required for install flows.
- Browser extension sandboxing is weaker than a native process sandbox unless workers/iframes and strict manifests are used.
- Desktop can provide better file system and SQLite behavior than web.
- Electron increases bundle/security surface, so desktop APIs must be explicit, minimal, and isolated.
- Provider scraping may break due to site changes, anti-bot systems, or legal risk.
- Cloud sync must not assume provider code or source distribution is centralized.

## Open Questions

- Which Electron SQLite driver should be used for desktop: `better-sqlite3`, `sqlite3`, libSQL, or another option?
- How strict should browser extension sandboxing be in the first implementation: worker-only, iframe plus worker, SES-style compartment, or trusted bundle execution with manifest limits?
- Should extension packages be plain JS bundles, JSON manifests plus scripts, WASM, or a hybrid?
- How much provider code should be allowed to execute locally?
- What signing/checksum model is realistic for community extensions?
- How should provider authentication secrets be stored on web vs desktop?
- How should global NSFW preferences combine with provider-specific preferences?
- What confidence scoring rules should duplicate manga detection use initially?
- What merge/unmerge UI should be used for ambiguous identities?
- How much offline chapter caching is realistic in browser storage?
- How should restore handle missing providers or unavailable extension registries?
- How should broken providers be quarantined or disabled automatically?
- How should motion scale down for low-performance devices beyond reduced motion?
- How should the reader handle extremely long webtoon chapters without excessive DOM and memory usage?

## Acceptance Criteria

- Documentation exists for product spec, plan, architecture, design, and agent instructions.
- Agents are instructed to read the right documents before implementation.
- The next implementation phase targets TanStack Start, Electron, Express where appropriate, Drizzle, SQLite, shadcn/ui, GSAP, and local-first architecture.
- Package boundaries are explicit and prevent UI/features from reaching into provider, database, reader, or platform internals.
- Extension safety and provider distribution separation are documented.
- Reader requirements exceed the current implementation and directly address tap zone reliability.
- Motion requirements are integrated into the design system and constrained for reader performance.
- Performance, caching, prefetching, optimistic updates, and local-first behavior are first-class requirements.
- Cloud sync is documented as a later phase after local correctness.
