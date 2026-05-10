# Phase 2 Core Domain Models Spec

## Goal

Define stable, test-covered TypeScript domain models for MangaVerse before database, provider runtime, reader, and UI implementation.

## Scope

Phase 2 implements type contracts and lightweight validation helpers only.

It must not add database tables, Drizzle schema, UI components, provider runtime execution, extension sandboxing, routing, persistence, or feature screens.

## Package Ownership

Primary implementation lives in `packages/shared/src`.

`@app/shared` owns cross-package domain types and generic helpers.

Do not import app shells, database internals, provider runtime internals, UI packages, Electron APIs, browser globals, or Node APIs.

## Required Domain Areas

Implement these model groups:

1. Manga identity model
2. Provider manifest and capability model
3. Chapter, page, and read-state models
4. Reader settings model
5. Library entry and category models
6. Extension install metadata model
7. Backup schema model
8. Normalized result and error types

## Required Helpers

Implement these dependency-free helpers:

1. `ok(value)`
2. `err(error)`
3. `createAppError(input)`
4. `hasProviderCapability(manifest, capability)`
5. `validateProviderManifest(manifest)`
6. `getDefaultReaderSettings()`
7. `resolveReaderSettings(globalSettings, overrides)`
8. `validateReaderSettings(settings)`
9. `validateBackupDocument(document)`

## Design Constraints

Use branded string types for core IDs.

Represent provider capabilities as structured data, not scattered booleans.

Manga identity must support multiple provider mappings and one default provider mapping.

Reader settings must support global defaults and per-title overrides.

Provider manifest must include explicit permissions, capabilities, compatibility, languages, content flags, and source URL metadata.

Backup schema must be versioned from day one.

Errors must be normalized and safe to show or log without leaking credentials.

## Files

Create:

`packages/shared/src/result.ts`

`packages/shared/src/manga.ts`

`packages/shared/src/provider.ts`

`packages/shared/src/chapter.ts`

`packages/shared/src/reader-settings.ts`

`packages/shared/src/library.ts`

`packages/shared/src/extension-install.ts`

`packages/shared/src/backup.ts`

`packages/shared/src/types.test.ts`

`packages/shared/src/result.test.ts`

`packages/shared/src/provider.test.ts`

`packages/shared/src/manga.test.ts`

`packages/shared/src/reader-settings.test.ts`

`packages/shared/src/backup.test.ts`

Modify:

`packages/shared/src/index.ts`

`packages/shared/src/index.test.ts`

## Acceptance Criteria

`@app/shared` exports stable domain types and helpers.

Provider capability checks can be expressed without provider-specific UI hacks.

Manga identity can represent multiple provider mappings.

Reader settings can represent global settings and per-title overrides.

Backup documents are versioned and minimally validated.

Unit tests cover validation helpers, default reader settings, settings override resolution, provider capability checks, result helpers, and backup validation.

Type-level tests cover important provider capability and identity shapes using Vitest `expectTypeOf`.

No new runtime dependency is introduced.

## Verification

Run:

`pnpm --filter @app/shared test`

`pnpm --filter @app/shared typecheck`

`pnpm --filter @app/shared build`

`pnpm test`

`pnpm typecheck`

`pnpm lint`
