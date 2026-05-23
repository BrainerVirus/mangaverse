# Phase 2 Core Domain Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared TypeScript domain model foundation for MangaVerse Phase 2.

**Architecture:** Implement dependency-free model modules in `@app/shared`, then export them through `packages/shared/src/index.ts`. Keep the package pure and independent from DB, UI, platform, Electron, provider runtime, and app shells.

**Tech Stack:** TypeScript, Vitest, oxlint, pnpm workspace.

---

## Required Skills For Implementing Agent

Use these before implementation:

`using-superpowers`

`subagent-driven-development` or `executing-plans`

`test-driven-development`

`typescript-advanced-types`

`verification-before-completion`

`oxlint`

## Task 1: Result And Error Model

**Files:**

Create `packages/shared/src/result.ts`

Create `packages/shared/src/result.test.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Write failing tests for `ok`, `err`, and `createAppError`.
- [ ] Add `AppErrorCode`, `AppError`, `AppResult`, `ok`, `err`, and `createAppError`.
- [ ] Ensure `createAppError` accepts code, message, optional cause, provider ID, retryable flag, and safe details.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- result.test.ts`.
- [ ] Commit with `feat(shared): add normalized result model`.

## Task 2: Manga Identity Model

**Files:**

Create `packages/shared/src/manga.ts`

Create `packages/shared/src/manga.test.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Write failing tests proving one manga identity can hold multiple provider mappings.
- [ ] Add branded ID helpers/types for `MangaId`, `ProviderId`, `ProviderMangaId`, and `ProviderMappingId`.
- [ ] Add `MangaIdentity`, `MangaProviderMapping`, `MangaTitle`, `MangaPerson`, `MangaTag`, `MangaStatus`, and `ContentRating`.
- [ ] Add `getDefaultProviderMapping(identity)` returning the mapping matching `defaultProviderMappingId`.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- manga.test.ts`.
- [ ] Commit with `feat(shared): add manga identity model`.

## Task 3: Provider Manifest And Capabilities

**Files:**

Create `packages/shared/src/provider.ts`

Create `packages/shared/src/provider.test.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Write failing tests for capability lookup and manifest validation.
- [ ] Add `ProviderManifest`, `ProviderCapabilityMap`, `ProviderPermission`, `ProviderCompatibility`, `ProviderContentFlags`, and related literal unions.
- [ ] Add `hasProviderCapability(manifest, capability)`.
- [ ] Add `validateProviderManifest(manifest)` returning `AppResult<ProviderManifest>`.
- [ ] Ensure validation requires ID, name, version, source URL, compatibility, capabilities, permissions, languages, and content flags.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- provider.test.ts`.
- [ ] Commit with `feat(shared): add provider manifest model`.

## Task 4: Chapter, Page, And Read State

**Files:**

Create `packages/shared/src/chapter.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Add tests in `packages/shared/src/types.test.ts` for chapter/page/read-state shape compatibility.
- [ ] Add `ChapterId`, `ChapterPageId`, `Chapter`, `ChapterPage`, `ChapterReadState`, `ReadingProgress`, and page image metadata types.
- [ ] Include fields needed by future reader flow: page index, image URL, width, height, failed/retry metadata, read percentage, last page index, completed state, and timestamps.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- types.test.ts`.
- [ ] Commit with `feat(shared): add chapter and read state models`.

## Task 5: Reader Settings Model

**Files:**

Create `packages/shared/src/reader-settings.ts`

Create `packages/shared/src/reader-settings.test.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Write failing tests for defaults, validation, and per-title override resolution.
- [ ] Add `ReaderSettings`, `ReaderSettingsOverride`, `ReadingMode`, `PageLayoutMode`, `FitMode`, `TapZoneLayout`, `PageTransitionMode`, and related setting unions.
- [ ] Add `getDefaultReaderSettings()`.
- [ ] Add `resolveReaderSettings(globalSettings, overrides)`.
- [ ] Add `validateReaderSettings(settings)` returning `AppResult<ReaderSettings>`.
- [ ] Ensure validation rejects negative preload count, invalid webtoon gap, and invalid zoom levels.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- reader-settings.test.ts`.
- [ ] Commit with `feat(shared): add reader settings model`.

## Task 6: Library And Category Models

**Files:**

Create `packages/shared/src/library.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Add type-level tests for library entry and category shape.
- [ ] Add `LibraryEntryId`, `CategoryId`, `LibraryEntry`, `LibraryCategory`, `LibraryStatus`, `LibraryLayoutMode`, and sorting/filtering model types.
- [ ] Include fields for favorite, categories, unread count, last read chapter, provider mapping selection, progress, and timestamps.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- types.test.ts`.
- [ ] Commit with `feat(shared): add library domain models`.

## Task 7: Extension Install Metadata

**Files:**

Create `packages/shared/src/extension-install.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Add type-level tests for extension install metadata shape.
- [ ] Add `ExtensionInstallId`, `ExtensionInstallMetadata`, `ExtensionInstallState`, `ExtensionRegistryEntry`, and `ExtensionInstallWarning`.
- [ ] Include fields for manifest, source URL, registry URL, checksum, installed version, enabled flag, install timestamps, health status, and warnings.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- types.test.ts`.
- [ ] Commit with `feat(shared): add extension install metadata`.

## Task 8: Backup Schema Model

**Files:**

Create `packages/shared/src/backup.ts`

Create `packages/shared/src/backup.test.ts`

Modify `packages/shared/src/index.ts`

Steps:

- [ ] Write failing tests for valid and invalid backup document validation.
- [ ] Add `BACKUP_SCHEMA_VERSION = 1`.
- [ ] Add `BackupDocumentV1`, `BackupMetadata`, `BackupProviderSnapshot`, `BackupSettingsSnapshot`, and `BackupValidationIssue`.
- [ ] Add `validateBackupDocument(document)` returning `AppResult<BackupDocumentV1>`.
- [ ] Ensure validation checks schema version, creation timestamp, app version, library array, manga identities array, installed extensions array, reader settings, provider settings, and theme settings.
- [ ] Export the module from `index.ts`.
- [ ] Run `pnpm --filter @app/shared test -- backup.test.ts`.
- [ ] Commit with `feat(shared): add backup schema model`.

## Task 9: Public Export And Smoke Test Cleanup

**Files:**

Modify `packages/shared/src/index.ts`

Modify `packages/shared/src/index.test.ts`

Steps:

- [ ] Replace smoke-only assertions with checks that the public package exports core helpers.
- [ ] Keep `PACKAGE_NAME` exported for existing smoke expectations unless there is a deliberate repo-wide cleanup.
- [ ] Run `pnpm --filter @app/shared test`.
- [ ] Run `pnpm --filter @app/shared typecheck`.
- [ ] Run `pnpm --filter @app/shared build`.
- [ ] Commit with `test(shared): cover public domain exports`.

## Task 10: Final Verification

Steps:

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Review `docs/SPEC.md`, `docs/PLAN.md`, and `docs/ARCHITECTURE.md` Phase 2 requirements against implemented files.
- [ ] Confirm no DB, UI, Electron, platform, provider runtime, or app shell code was added.
- [ ] Commit any final fixes with a focused message.
