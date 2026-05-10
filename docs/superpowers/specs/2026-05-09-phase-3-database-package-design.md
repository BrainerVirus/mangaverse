# Phase 3: `@app/db` Database Package (Design Spec)

**Date:** 2026-05-09  
**Status:** Approved for implementation  
**Approach:** Adapter-first `@app/db`

## Summary

Build `@app/db` as the single data-access package for MangaVerse local-first persistence. Production SQLite drivers stay behind an adapter boundary; Phase 3 uses in-memory `sql.js` as the integration-test and harness runtime.

## Alternatives Considered

1. **Adapter-first with `sql.js` test runtime (chosen)**  
   Best fit. Keeps `@app/db` independent from browser/Electron platform wiring while still testing real Drizzle queries, migrations, repositories, backup export, and restore preview.

2. **Driver-first with browser and Electron runtimes now**  
   Too early. Phase 4 owns platform capability differences, so choosing production SQLite drivers now would couple DB to platform work prematurely.

3. **Schema-only with no runtime**  
   Too weak. Phase 3 acceptance requires integration tests, migrations, repository behavior, and backup/restore preview tests.

## Goal

Deliver `@app/db` as the authoritative local persistence layer: schema, migrations, repositories, transactions, backup serialization, and restore preview—without wiring browser WASM or Electron native drivers.

## Scope

- Add Drizzle SQLite schema covering identities, library, chapters, read state, settings, extensions, search, migration metadata, cache, and reserved sync fields.
- Add migrations and a migration runner (empty database → latest schema).
- Add an adapter boundary so repositories depend on Drizzle + schema, not a specific driver.
- Add repository APIs for local-first reads/writes aligned with `@app/shared` domain types.
- Add transaction helpers safe for repository composition.
- Add backup export producing `BackupDocumentV1` (`@app/shared`).
- Add restore validation and preview (read-only analysis vs current DB snapshot).
- Add integration tests using in-memory `sql.js`.

## Non-Goals

- Do not implement browser WASM persistence wiring.
- Do not implement Electron native SQLite driver wiring.
- Do not add UI.
- Do not add provider runtime execution.
- Do not add cloud sync behavior beyond reserved schema fields (e.g. `sync_state`).
- Do not expose raw SQL outside `@app/db`.

## Driver Strategy

- `@app/db` owns schema and repository contracts.
- Production driver selection is deferred behind an adapter-style API (construct Drizzle DB from a runtime-provided SQLite API).
- Phase 3 uses `sql.js` only as the test/runtime harness for repository and migration integration tests.
- Phase 4 connects the adapter to `@app/platform` for browser and Electron.

## Core Package Files

- `packages/db/src/schema.ts`
- `packages/db/src/client.ts`
- `packages/db/src/adapter.ts`
- `packages/db/src/migrations.ts`
- `packages/db/src/transactions.ts`
- `packages/db/src/repositories/identities.ts`
- `packages/db/src/repositories/library.ts`
- `packages/db/src/repositories/chapters.ts`
- `packages/db/src/repositories/read-state.ts`
- `packages/db/src/repositories/settings.ts`
- `packages/db/src/repositories/extensions.ts`
- `packages/db/src/repositories/search-history.ts`
- `packages/db/src/repositories/migration-history.ts`
- `packages/db/src/repositories/cache.ts`
- `packages/db/src/backup/export.ts`
- `packages/db/src/backup/restore-preview.ts`
- `packages/db/src/testing/sqljs-harness.ts`
- `packages/db/src/index.ts`

## Schema Tables

Required tables:

- `manga_identities`
- `manga_provider_mappings`
- `manga_titles`
- `manga_people`
- `manga_tags`
- `manga_tag_memberships`
- `library_entries`
- `categories`
- `library_category_memberships`
- `chapters`
- `chapter_pages`
- `chapter_read_state`
- `reading_history`
- `reader_preferences`
- `extension_registries`
- `installed_extensions`
- `provider_settings`
- `theme_preferences`
- `app_settings`
- `migration_jobs`
- `migration_history`
- `tracking_links`
- `search_history`
- `saved_searches`
- `cache_entries`
- `sync_state`

## Important Indexes

- Unique provider mapping by `provider_id` + `provider_manga_id`.
- Library lookup by manga ID.
- Category membership by category and entry (and uniqueness where appropriate).
- Chapter lookup by provider mapping and chapter index.
- Read-state lookup by manga/chapter.
- History ordered by `read_at`.
- Search history by query/time.
- Cache entries by provider/manga/chapter/last access.
- Migration history by source/target provider mapping fields.

## Repository Requirements

- Return shared domain types from `@app/shared` where possible.
- Accept branded IDs from `@app/shared`.
- Hide Drizzle table objects from feature packages unless explicitly exported as stable DB internals (default: do not export tables).
- Use `AppResult` for recoverable operations.
- Preserve local-first reads: library, identities, progress, settings, installed extensions, provider settings, theme preferences, and cache metadata must be readable without provider network calls.
- Support identity merge/unmerge foundations (merged flags, merged-from references, mapping reassignment hooks).
- Support provider switching through mappings and `active_provider_mapping_id` / default mapping IDs.
- Support progress writes structured for debounced/checkpoint persistence (repository APIs; no UI coupling).

## Backup / Restore

- Export a `BackupDocumentV1` compatible with `@app/shared` validation.
- Include library, identities, installed extensions, reader settings, provider settings, and theme settings.
- Restore preview must validate shape, report conflicts, missing providers, duplicate mappings, unsupported schema versions, and destructive changes.
- Restore preview must not mutate the database (validation + in-memory comparison only; optional read-only SELECTs against the live DB for current-state comparison are allowed).

## Acceptance Criteria

- No raw SQL is required outside `@app/db`.
- Schema supports duplicate manga identity mapping and provider switching (unique remote IDs per provider, multiple mappings per identity).
- Repositories support critical local-first reads.
- Migration runner can initialize an empty DB to latest schema.
- Backup export serializes core local data into `BackupDocumentV1`.
- Restore preview reports conflicts without mutating data.
- Integration tests run against in-memory SQLite (`sql.js`).
- `pnpm --filter @app/db test`, `typecheck`, and `build` pass.
- Root `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

## References

- `docs/ARCHITECTURE.md` — package boundaries and `@app/db` responsibilities.
- Phase 2 shared models in `packages/shared` — `manga`, `library`, `chapter`, `reader-settings`, `backup`, `provider`, `extension-install`, `result`.
