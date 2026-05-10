# Phase 3: `@app/db` Gap-Fix Design Spec

**Date:** 2026-05-09  
**Status:** In progress  
**Refers to:** `2026-05-09-phase-3-database-package-design.md`

## Goal

Complete Phase 3 by tightening adapter boundaries, transaction semantics, SQLite integrity, restore preview conflict detection, and public API stability.

## Scope

- Enable SQLite FK enforcement in the harness and migration initialization.
- Harden transaction helper: document sync-only semantics and add rollback test.
- Keep test-only SQL.js harness out of the root `@app/db` public API.
- Validate provider mapping ownership before library/chapter/read-state writes.
- Add restore-preview checks against existing DB provider mappings.
- Replace exported schema row return types with stable DTOs.
- Document backup export's current Phase 3 limits.

## Non-Goals

- Do not wire production browser/Electron drivers (Phase 4).
- Do not expand `BackupDocumentV1` beyond its current Phase 2 definition.
- Do not rewrite the entire adapter layer; sql.js-specific function names are acceptable for Phase 3 as long as harness-internal functions are not exported publicly.

## Acceptance Criteria

- Existing verification commands still pass.
- FK violations throw when `PRAGMA foreign_keys = ON`.
- `withTransaction` rollback test proves synchronous throw aborts writes.
- `createSqlJsHarness` is NOT exported from root `@app/db`.
- Cross-identity provider mapping writes return `AppResult` errors.
- Restore preview reports remote mapping collisions with current DB.
- Public exported repository functions no longer return `typeof table.$inferSelect`.
- `pnpm --filter @app/db test`, `typecheck`, and `build` pass.
- Root `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
