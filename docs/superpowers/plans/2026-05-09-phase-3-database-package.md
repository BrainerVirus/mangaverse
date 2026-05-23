# Phase 3: `@app/db` Implementation Plan

**Date:** 2026-05-09  
**Spec:** [2026-05-09-phase-3-database-package-design.md](../specs/2026-05-09-phase-3-database-package-design.md)

## Recommended Agent Skills

- `using-superpowers`
- `subagent-driven-development` or `executing-plans`
- `test-driven-development`
- `typescript-advanced-types`
- `verification-before-completion`
- `oxlint`

## Preconditions

- `@app/shared` Phase 2 models and `BackupDocumentV1` validation are available.
- Monorepo scripts: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Task Sequence

### 1. Package runtime, tooling, and test config

**Files**

- `packages/db/package.json`
- `packages/db/vitest.config.ts`
- `packages/db/drizzle.config.ts` (optional but recommended for `drizzle-kit` introspection/generation)

**Work**

- Add runtime deps: `drizzle-orm`, `@app/shared` (workspace).
- Add dev deps: `vitest`, `typescript`, `oxlint`, `sql.js`, `@types/sql.js` (if not bundled), `drizzle-kit` (if SQL migrations are generated/managed via kit).
- Ensure `@app/db` builds before consumers (`turbo` already respects `dependsOn: ["^build"]`).
- Configure Vitest (`environment: 'node'`, include `src/**/*.test.ts`).

**Done when:** `pnpm --filter @app/db typecheck` succeeds with new deps installed.

### 2. Adapter boundary + sql.js harness + client factory

**Files**

- `packages/db/src/adapter.ts`
- `packages/db/src/client.ts`
- `packages/db/src/testing/sqljs-harness.ts`

**Work**

- Define the narrow surface Phase 4 will implement for non–`sql.js` drivers (e.g. “open Drizzle SQLite db from external handle” or factory interface)—avoid importing browser/Electron modules here.
- Implement `createAppDbFromSqlJs(...)` (or equivalent) returning a typed Drizzle instance bound to `schema`.
- Implement `openMemoryHarness()` for tests: in-memory `sql.js`, migrate to latest, return `{ db, raw }` as needed for assertions.

**Tests:** harness smoke test opens DB and runs migrations.

### 3. Drizzle schema + indexes

**Files**

- `packages/db/src/schema.ts`

**Work**

- Model all tables and relationships listed in the spec.
- Encode required indexes/constraints, especially:
  - Unique `(provider_id, provider_manga_id)` on mappings.
  - Library/chapter/read-state/search/cache/migration-history indexes described in the design spec.

**Tests:** none in isolation (covered by migrations + integration reads).

### 4. Migration runner

**Files**

- `packages/db/src/migrations.ts`
- `packages/db/migrations/*.sql`
- `packages/db/migrations/meta/_journal.json` (if using Drizzle migrator layout)

**Work**

- Ship SQL migrations (or kit-generated artifacts) that match `schema.ts`.
- Expose `migrateToLatest(db)` (name as implemented) using Drizzle’s migrator for `sql.js`.
- Document idempotency expectations: running migrations twice on the same DB should be safe (Drizzle journal table).

**Tests:** empty DB → migrate → `user_version` / drizzle migrations table present; second migrate does not throw.

### 5. Identity repositories

**Files**

- `packages/db/src/repositories/identities.ts`
- `packages/db/src/repositories/identities.test.ts` (or consolidated integration tests)

**Work**

- CRUD-ish operations for identities, mappings, titles, people, tags, tracking links as needed for `MangaIdentity` assembly.
- Operations: create identity, add mapping, set default mapping, merge foundation (mark merged + record merged-from), unmerge foundation (split guidance via stored ids—persist enough to round-trip).

**Tests:** create identity + two mappings; enforce unique provider remote IDs; switch default mapping.

### 6. Library + category repositories

**Files**

- `packages/db/src/repositories/library.ts`
- tests

**Work**

- Add/remove library entries; categories; memberships; sort/filter primitives at SQL level where reasonable (minimum: list entries with optional category filter).
- Persist `active_provider_mapping_id` updates for provider switching.

**Tests:** add entry, assign category, remove membership, update active mapping.

### 7. Chapters, read state, history repositories

**Files**

- `packages/db/src/repositories/chapters.ts`
- `packages/db/src/repositories/read-state.ts`
- tests

**Work**

- Chapter upsert + pages storage (normalized tables).
- Progress updates (`chapter_read_state`) and `reading_history` append/replace rules as designed.
- Recent reads query ordered by `read_at`.

**Tests:** upsert chapter with pages; write progress; list recent history.

### 8. Settings repositories

**Files**

- `packages/db/src/repositories/settings.ts`
- tests

**Work**

- Global reader preferences row(s) compatible with `ReaderSettings`.
- Provider settings key/value (JSON per provider).
- Theme preferences (`ThemeSettings`).
- `app_settings` key/value.

**Tests:** defaults + update round-trip using `validateReaderSettings` where applicable.

### 9. Extensions, search, migration jobs/history, cache repositories

**Files**

- `packages/db/src/repositories/extensions.ts`
- `packages/db/src/repositories/search-history.ts`
- `packages/db/src/repositories/migration-history.ts`
- `packages/db/src/repositories/cache.ts`
- tests

**Work**

- Installed extensions + registries persistence compatible with `ExtensionInstallMetadata` / registry DTOs.
- Search history + saved searches.
- Migration history rows indexed for source/target provider mapping lookups.
- Cache metadata entries with last-access updates.

**Tests:** minimal CRUD for each repository surface used by backup/export.

### 10. Transaction helper

**Files**

- `packages/db/src/transactions.ts`
- tests

**Work**

- Provide `withTransaction(db, fn)` with correct typing for `tx` compatible with repositories (either parameterized repos or `tx` passed into repo factories).

**Tests:** two writes in one transaction; rollback path on error (if supported by harness).

### 11. Backup export

**Files**

- `packages/db/src/backup/export.ts`
- tests

**Work**

- Implement `exportBackupDocumentV1(db, metadata)` returning a value compatible with `BackupDocumentV1`.
- Reuse `@app/shared` types; avoid duplicating validation logic beyond defensive checks.

**Tests:** populated DB → export → `validateBackupDocument` succeeds.

### 12. Restore preview

**Files**

- `packages/db/src/backup/restore-preview.ts`
- tests

**Work**

- Parse unknown input → `validateBackupDocument` from `@app/shared`.
- Build non-mutating report: conflicts with current DB IDs, missing installed providers, duplicate mappings inside backup, destructive overwrites, unsupported schema version (already part of validation), etc.
- Do not write to SQLite during preview.

**Tests:** fixture backup vs empty DB and vs conflicting DB.

### 13. Public exports + package tests

**Files**

- `packages/db/src/index.ts`
- `packages/db/src/index.test.ts`

**Work**

- Export: `PACKAGE_NAME`, client factory, migration runner, repository factories, transaction helper, backup export/preview, adapter types.
- Export `./testing` entry only if intentional for other packages’ tests; otherwise keep harness internal and tested via `@app/db` tests.

**Tests:** smoke + at least one cross-module integration test per major area.

### 14. Final verification (repo root)

**Commands**

- `pnpm --filter @app/db test`
- `pnpm --filter @app/db typecheck`
- `pnpm --filter @app/db build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

**Work**

- Confirm no app package imports Drizzle schema directly; only `@app/db` public API.
- Fix oxlint issues in touched files.

## Rollback / Risk Notes

- Prefer append-only migrations once released; Phase 3 may refactor freely until consumers exist.
- Keep JSON blobs schema-versioned where needed to avoid silent corruption across app versions.

## Completion Definition

All acceptance criteria in the design spec are met, commands in section 14 pass on a clean tree, and `@app/db` exposes a stable, documented public surface for Phase 4 platform wiring.
