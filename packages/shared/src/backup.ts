import type { AppSettings } from './app-settings.js';
import { backupDocumentSchema, toBackupValidationIssues } from './backup-schema.js';
import type { ExtensionInstallMetadata } from './extension-install.js';
import type { CategoryId, LibraryEntry, LibraryEntryId } from './library.js';
import type { MangaId, MangaIdentity, ProviderId } from './manga.js';
import type { ReaderSettings } from './reader-settings.js';
import { createAppError, type AppResult } from './result.js';
import type { ThemeDefinition } from './theme-definition.js';

export const BACKUP_SCHEMA_VERSION = 3 as const;
/** v1 predates custom themes, v2 predates app settings; all are readable, new exports write v3. */
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS: readonly number[] = [1, 2, 3];

export interface BackupMetadata {
  readonly createdAt: string;
  readonly appVersion: string;
  readonly deviceName?: string;
}

export interface BackupProviderSnapshot {
  readonly providerId: ProviderId;
  readonly label?: string;
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface BackupSettingsSnapshot {
  readonly providerSnapshots: readonly BackupProviderSnapshot[];
}

export interface ThemeSettings {
  /** A built-in preset id or a custom theme id stored in the `themes` table. */
  readonly themeId: string;
  readonly dark: boolean;
}

export interface BackupDocumentV1 {
  readonly schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  readonly metadata: BackupMetadata;
  readonly library: readonly LibraryEntry[];
  readonly mangaIdentities: readonly MangaIdentity[];
  readonly installedExtensions: readonly ExtensionInstallMetadata[];
  readonly readerSettings: ReaderSettings;
  readonly providerSettings: BackupSettingsSnapshot;
  readonly themeSettings: ThemeSettings;
  /** Custom themes only: built-ins are resolved from code. */
  readonly themes: readonly ThemeDefinition[];
  /** Absent in v1 and v2 backups, which predate app settings. */
  readonly appSettings?: AppSettings;
}

export interface BackupValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type BackupValidationResult = AppResult<BackupDocumentV1> & {
  readonly issues: readonly BackupValidationIssue[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates a whole backup document, nested entities included, through
 * `backupDocumentSchema`. The `{ok, error, issues}` shape and the schema versions
 * stay stable so `parse-backup-file`, `restore-preview` and `restore-apply` need
 * no changes.
 */
export function validateBackupDocument(input: unknown): BackupValidationResult {
  if (!isPlainObject(input)) {
    const message = 'Backup document must be an object.';
    return {
      ok: false,
      error: createAppError({ code: 'backup.invalid', message }),
      issues: [{ path: '', code: 'backup.invalid', message }],
    };
  }

  if (!SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(Number(input['schemaVersion']))) {
    const message = `Expected schemaVersion ${SUPPORTED_BACKUP_SCHEMA_VERSIONS.join(' or ')}, got ${String(input['schemaVersion'])}`;
    return {
      ok: false,
      error: createAppError({
        code: 'backup.invalid',
        message: 'Unsupported or missing backup schemaVersion.',
        details: { received: String(input['schemaVersion']) },
      }),
      issues: [{ path: 'schemaVersion', code: 'backup.invalid', message }],
    };
  }

  const parsed = backupDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issues = toBackupValidationIssues(parsed.error);
    return {
      ok: false,
      error: createAppError({ code: 'backup.invalid', message: issues[0]!.message }),
      issues,
    };
  }

  return {
    ok: true,
    value: { ...parsed.data, schemaVersion: BACKUP_SCHEMA_VERSION } as unknown as BackupDocumentV1,
    issues: [],
  };
}

export interface BackupLibraryMerge {
  readonly mangaId: MangaId;
  readonly keptId: LibraryEntryId;
  readonly removedIds: readonly LibraryEntryId[];
}

export interface BackupLibraryDedupeResult {
  readonly library: readonly LibraryEntry[];
  readonly removedIds: readonly LibraryEntryId[];
  readonly removedCount: number;
  readonly merges: readonly BackupLibraryMerge[];
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

/** A present timestamp beats an absent one; otherwise compare codepoints. */
function compareTimestamps(a: string | undefined, b: string | undefined): number {
  const left = nonEmpty(a);
  const right = nonEmpty(b);
  if (left === right) return 0;
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  return left < right ? -1 : 1;
}

function isBetterKeeper(candidate: LibraryEntry, current: LibraryEntry): boolean {
  const byUpdatedAt = compareTimestamps(candidate.updatedAt, current.updatedAt);
  if (byUpdatedAt !== 0) return byUpdatedAt > 0;
  const byAddedAt = compareTimestamps(candidate.addedAt, current.addedAt);
  if (byAddedAt !== 0) return byAddedAt > 0;
  return candidate.id < current.id;
}

function earliest(values: readonly (string | undefined)[]): string | undefined {
  let out: string | undefined;
  for (const value of values) {
    const timestamp = nonEmpty(value);
    if (timestamp === undefined) continue;
    if (out === undefined || timestamp < out) out = timestamp;
  }
  return out;
}

function latest(values: readonly (string | undefined)[]): string | undefined {
  let out: string | undefined;
  for (const value of values) {
    const timestamp = nonEmpty(value);
    if (timestamp === undefined) continue;
    if (out === undefined || timestamp > out) out = timestamp;
  }
  return out;
}

/**
 * Backups exported before migration 0003 can hold two library entries for one
 * manga, which the unique index now rejects. Merge each group deterministically:
 * the entry with the latest non-empty `updatedAt` keeps its identity and status
 * fields, with ties broken by the latest non-empty `addedAt` and then the
 * codepoint-smallest `id`. Categories, favorite, progress and timestamps
 * combine so a restore loses no progress written to a duplicate.
 */
export function dedupeBackupLibrary(library: readonly LibraryEntry[]): BackupLibraryDedupeResult {
  const groups = new Map<string, LibraryEntry[]>();
  for (const entry of library) {
    const group = groups.get(entry.mangaId);
    if (group === undefined) groups.set(entry.mangaId, [entry]);
    else group.push(entry);
  }

  const out: LibraryEntry[] = [];
  const removedIds: LibraryEntryId[] = [];
  const merges: BackupLibraryMerge[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }

    let keeperIndex = 0;
    for (let index = 1; index < group.length; index += 1) {
      if (isBetterKeeper(group[index]!, group[keeperIndex]!)) keeperIndex = index;
    }
    const keeper = group[keeperIndex]!;
    const ordered = [keeper, ...group.filter((_, index) => index !== keeperIndex)];

    const categoryIds: CategoryId[] = [];
    const seenCategories = new Set<string>();
    let progressPercent: number | undefined;
    let furthestEntry: LibraryEntry | undefined;
    for (const entry of ordered) {
      for (const categoryId of entry.categoryIds) {
        if (seenCategories.has(categoryId)) continue;
        seenCategories.add(categoryId);
        categoryIds.push(categoryId);
      }
      if (entry.progressPercent !== undefined) {
        if (progressPercent === undefined || entry.progressPercent > progressPercent) {
          progressPercent = entry.progressPercent;
          furthestEntry = entry;
        } else if (
          entry.progressPercent === progressPercent &&
          furthestEntry?.lastReadChapterId === undefined &&
          entry.lastReadChapterId !== undefined
        ) {
          furthestEntry = entry;
        }
      }
    }

    const notes =
      nonEmpty(keeper.notes) ??
      ordered.map((entry) => nonEmpty(entry.notes)).find((value) => value !== undefined);
    const lastReadChapterId = furthestEntry?.lastReadChapterId ?? keeper.lastReadChapterId;
    const addedAt = earliest(ordered.map((entry) => entry.addedAt));
    const updatedAt = latest(ordered.map((entry) => entry.updatedAt));
    const dropped = ordered.slice(1);

    out.push({
      id: keeper.id,
      mangaId: keeper.mangaId,
      favorite: ordered.some((entry) => entry.favorite),
      categoryIds,
      status: keeper.status,
      unreadCount: keeper.unreadCount,
      ...(lastReadChapterId !== undefined ? { lastReadChapterId } : {}),
      ...(keeper.activeProviderMappingId !== undefined
        ? { activeProviderMappingId: keeper.activeProviderMappingId }
        : {}),
      ...(progressPercent !== undefined ? { progressPercent } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(addedAt !== undefined ? { addedAt } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    });

    removedIds.push(...dropped.map((entry) => entry.id));
    merges.push({
      mangaId: keeper.mangaId,
      keptId: keeper.id,
      removedIds: dropped.map((entry) => entry.id),
    });
  }

  return { library: out, removedIds, removedCount: removedIds.length, merges };
}
