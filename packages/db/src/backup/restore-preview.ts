import type { BackupValidationIssue } from '@app/shared';
import {
  BACKUP_SCHEMA_VERSION,
  dedupeBackupLibrary,
  validateBackupDocument,
  toMangaId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import {
  categories,
  chapterReadState,
  chapters,
  libraryEntries,
  mangaIdentities,
  mangaProviderMappings,
  migrationHistory,
  readingHistory,
  themes,
} from '../schema.js';
import { listInstalledExtensions } from '../repositories/extensions.js';
import { getMangaIdentity } from '../repositories/identities.js';

export type RestorePreviewSeverity = 'info' | 'warning' | 'error';

export interface RestorePreviewIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: RestorePreviewSeverity;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RestorePreviewCounts {
  readonly libraryEntries: number;
  readonly categories: number;
  readonly categoryMemberships: number;
  readonly chapters: number;
  readonly chapterReadStates: number;
  readonly readingHistory: number;
  readonly migrationHistory: number;
}

const EMPTY_COUNTS: RestorePreviewCounts = {
  libraryEntries: 0,
  categories: 0,
  categoryMemberships: 0,
  chapters: 0,
  chapterReadStates: 0,
  readingHistory: 0,
  migrationHistory: 0,
};

export interface RestorePreviewReport {
  readonly backupOk: boolean;
  readonly backupIssues: readonly BackupValidationIssue[];
  readonly previewIssues: readonly RestorePreviewIssue[];
  /** Null when the document did not validate. */
  readonly schemaVersion: number | null;
  readonly counts: RestorePreviewCounts;
}

function add(
  issues: RestorePreviewIssue[],
  input: {
    readonly code: string;
    readonly message: string;
    readonly severity: RestorePreviewSeverity;
    readonly details?: RestorePreviewIssue['details'];
  },
): void {
  issues.push({
    code: input.code,
    message: input.message,
    severity: input.severity,
    ...(input.details !== undefined ? { details: input.details } : {}),
  });
}

/**
 * Validates a backup payload and compares it against the current local database **without mutating** data.
 */
export async function previewBackupRestore(
  db: AppDrizzleDb,
  input: unknown,
): Promise<RestorePreviewReport> {
  const validation = validateBackupDocument(input);
  if (!validation.ok) {
    return {
      backupOk: false,
      backupIssues: validation.issues,
      previewIssues: [],
      schemaVersion: null,
      counts: EMPTY_COUNTS,
    };
  }

  const doc = validation.value;
  const schemaVersion = Number((input as { readonly schemaVersion?: unknown }).schemaVersion);
  const previewIssues: RestorePreviewIssue[] = [];

  const remoteKey = (providerId: string, providerMangaId: string) =>
    `${providerId}::${providerMangaId}`;
  const seenRemotes = new Set<string>();
  for (const identity of doc.mangaIdentities) {
    for (const mapping of identity.providerMappings) {
      const key = remoteKey(mapping.providerId, mapping.providerMangaId);
      if (seenRemotes.has(key)) {
        add(previewIssues, {
          code: 'restore.duplicate_remote_mapping',
          message: 'Backup contains duplicate provider remote ids.',
          severity: 'error',
          details: { key },
        });
      }
      seenRemotes.add(key);
    }
  }

  const dbMappings = db.select().from(mangaProviderMappings).all();
  const dbRemoteToMapping = new Map<string, (typeof dbMappings)[number]>();
  for (const row of dbMappings) {
    dbRemoteToMapping.set(remoteKey(row.providerId, row.providerMangaId), row);
  }

  for (const identity of doc.mangaIdentities) {
    for (const mapping of identity.providerMappings) {
      const key = remoteKey(mapping.providerId, mapping.providerMangaId);
      const dbMapping = dbRemoteToMapping.get(key);
      if (dbMapping !== undefined && dbMapping.mangaId !== identity.id) {
        add(previewIssues, {
          code: 'restore.remote_collision_with_db',
          message:
            'A backup provider remote id already exists in the local database under a different manga identity.',
          severity: 'warning',
          details: {
            providerId: mapping.providerId,
            providerMangaId: mapping.providerMangaId,
            backupMangaId: identity.id,
            dbMangaId: dbMapping.mangaId,
          },
        });
      }
    }
  }

  const identityIds = new Set(doc.mangaIdentities.map((m) => m.id));
  const mappingIdsByManga = new Map<string, Set<string>>();
  for (const identity of doc.mangaIdentities) {
    mappingIdsByManga.set(identity.id, new Set(identity.providerMappings.map((m) => m.id)));
  }
  const mappingBelongsToManga = (mangaId: string, mappingId: string): boolean =>
    mappingIdsByManga.get(mangaId)?.has(mappingId) ?? false;

  const localCategoryIds = new Set(
    db
      .select({ id: categories.id })
      .from(categories)
      .all()
      .map((row) => row.id),
  );
  const carriedCategoryIds = new Set<string>();
  for (const category of doc.categories ?? []) {
    if (carriedCategoryIds.has(category.id)) {
      add(previewIssues, {
        code: 'restore.duplicate_category',
        message: 'Backup contains the same category id more than once.',
        severity: 'error',
        details: { categoryId: category.id },
      });
    }
    carriedCategoryIds.add(category.id);
  }

  const carriedChapterIds = new Set<string>();
  const carriedChapterSlots = new Set<string>();
  for (const chapter of doc.chapters ?? []) {
    if (carriedChapterIds.has(chapter.id)) {
      add(previewIssues, {
        code: 'restore.duplicate_chapter',
        message: 'Backup contains the same chapter id more than once.',
        severity: 'error',
        details: { chapterId: chapter.id },
      });
    }
    carriedChapterIds.add(chapter.id);
    const slot = `${chapter.providerMappingId}::${chapter.index}`;
    if (carriedChapterSlots.has(slot)) {
      add(previewIssues, {
        code: 'restore.duplicate_chapter_slot',
        message: 'Backup contains two chapters for the same provider mapping and index.',
        severity: 'error',
        details: { providerMappingId: chapter.providerMappingId, index: chapter.index },
      });
    }
    carriedChapterSlots.add(slot);
    if (!identityIds.has(chapter.mangaId)) {
      add(previewIssues, {
        code: 'restore.chapter_missing_identity',
        message: 'Chapter references a manga identity missing from the backup document.',
        severity: 'error',
        details: { chapterId: chapter.id, mangaId: chapter.mangaId },
      });
    } else if (!mappingBelongsToManga(chapter.mangaId, chapter.providerMappingId)) {
      add(previewIssues, {
        code: 'restore.chapter_mapping_missing',
        message: 'Chapter references a provider mapping missing from the backup document.',
        severity: 'error',
        details: { chapterId: chapter.id, providerMappingId: chapter.providerMappingId },
      });
    }
  }

  const dedupedLibrary = dedupeBackupLibrary(doc.library);
  for (const merge of dedupedLibrary.merges) {
    add(previewIssues, {
      code: 'restore.library_duplicates_merged',
      message:
        'Backup contains more than one library entry for the same manga; they are merged into one on restore.',
      severity: 'warning',
      details: {
        mangaId: merge.mangaId,
        keptId: merge.keptId,
        droppedCount: merge.removedIds.length,
      },
    });
  }

  const membershipKeys = new Set<string>();
  for (const entry of dedupedLibrary.library) {
    if (!identityIds.has(entry.mangaId)) {
      add(previewIssues, {
        code: 'restore.library_missing_identity',
        message: 'Library entry references a manga identity missing from the backup document.',
        severity: 'error',
        details: { libraryEntryId: entry.id, mangaId: entry.mangaId },
      });
    }
    for (const categoryId of new Set(entry.categoryIds)) {
      membershipKeys.add(`${entry.id}::${categoryId}`);
      if (doc.categories !== undefined) {
        if (!carriedCategoryIds.has(categoryId)) {
          add(previewIssues, {
            code: 'restore.category_missing',
            message: 'Library entry references a category missing from the backup document.',
            severity: 'error',
            details: { libraryEntryId: entry.id, categoryId },
          });
        }
      } else if (!localCategoryIds.has(categoryId)) {
        // v1-v3 backups carry no category definitions: keep the link only when
        // the category still exists locally instead of failing the whole restore.
        add(previewIssues, {
          code: 'restore.category_missing',
          message:
            'Library entry references a category that is neither in this older backup nor in the local database; the link is skipped on restore.',
          severity: 'warning',
          details: { libraryEntryId: entry.id, categoryId },
        });
      }
    }
    if (
      doc.chapters !== undefined &&
      entry.lastReadChapterId !== undefined &&
      !carriedChapterIds.has(entry.lastReadChapterId)
    ) {
      add(previewIssues, {
        code: 'restore.library_chapter_missing',
        message: 'Library entry resume chapter is missing from the backup document.',
        severity: 'error',
        details: { libraryEntryId: entry.id, chapterId: entry.lastReadChapterId },
      });
    }
  }

  const seenReadChapterIds = new Set<string>();
  for (const state of doc.chapterReadStates ?? []) {
    if (seenReadChapterIds.has(state.chapterId)) {
      add(previewIssues, {
        code: 'restore.duplicate_chapter_read_state',
        message: 'Backup contains read state for the same chapter more than once.',
        severity: 'error',
        details: { chapterId: state.chapterId },
      });
    }
    seenReadChapterIds.add(state.chapterId);
    if (doc.chapters !== undefined && !carriedChapterIds.has(state.chapterId)) {
      add(previewIssues, {
        code: 'restore.read_state_chapter_missing',
        message: 'Chapter read state points at a chapter missing from the backup document.',
        severity: 'error',
        details: { chapterId: state.chapterId },
      });
    } else if (!identityIds.has(state.mangaId)) {
      add(previewIssues, {
        code: 'restore.read_state_missing_identity',
        message: 'Chapter read state references a manga identity missing from the backup document.',
        severity: 'error',
        details: { chapterId: state.chapterId, mangaId: state.mangaId },
      });
    } else if (
      state.providerMappingId !== undefined &&
      !mappingBelongsToManga(state.mangaId, state.providerMappingId)
    ) {
      add(previewIssues, {
        code: 'restore.read_state_mapping_missing',
        message:
          'Chapter read state references a provider mapping missing from the backup document.',
        severity: 'error',
        details: { chapterId: state.chapterId, providerMappingId: state.providerMappingId },
      });
    }
  }

  const seenHistoryIds = new Set<string>();
  for (const entry of doc.readingHistory ?? []) {
    if (seenHistoryIds.has(entry.id)) {
      add(previewIssues, {
        code: 'restore.duplicate_reading_history',
        message: 'Backup contains the same reading-history id more than once.',
        severity: 'error',
        details: { historyId: entry.id },
      });
    }
    seenHistoryIds.add(entry.id);
    if (doc.chapters !== undefined && !carriedChapterIds.has(entry.chapterId)) {
      add(previewIssues, {
        code: 'restore.history_chapter_missing',
        message: 'Reading history points at a chapter missing from the backup document.',
        severity: 'error',
        details: { historyId: entry.id, chapterId: entry.chapterId },
      });
    } else if (!identityIds.has(entry.mangaId)) {
      add(previewIssues, {
        code: 'restore.history_missing_identity',
        message: 'Reading history references a manga identity missing from the backup document.',
        severity: 'error',
        details: { historyId: entry.id, mangaId: entry.mangaId },
      });
    } else if (
      entry.providerMappingId !== undefined &&
      !mappingBelongsToManga(entry.mangaId, entry.providerMappingId)
    ) {
      add(previewIssues, {
        code: 'restore.history_mapping_missing',
        message: 'Reading history references a provider mapping missing from the backup document.',
        severity: 'error',
        details: { historyId: entry.id, providerMappingId: entry.providerMappingId },
      });
    }
  }

  const seenMigrationIds = new Set<string>();
  for (const entry of doc.migrationHistory ?? []) {
    if (seenMigrationIds.has(entry.id)) {
      add(previewIssues, {
        code: 'restore.duplicate_migration_history',
        message: 'Backup contains the same migration-history id more than once.',
        severity: 'error',
        details: { migrationId: entry.id },
      });
    }
    seenMigrationIds.add(entry.id);
    if (!identityIds.has(entry.mangaId)) {
      add(previewIssues, {
        code: 'restore.migration_missing_identity',
        message: 'Migration history references a manga identity missing from the backup document.',
        severity: 'error',
        details: { migrationId: entry.id, mangaId: entry.mangaId },
      });
      continue;
    }
    for (const [field, mappingId] of [
      ['previousDefaultMappingId', entry.previousDefaultMappingId],
      ['previousActiveMappingId', entry.previousActiveMappingId],
    ] as const) {
      if (mappingId !== undefined && !mappingBelongsToManga(entry.mangaId, mappingId)) {
        add(previewIssues, {
          code: 'restore.migration_mapping_missing',
          message: `Migration history ${field} points at a mapping missing from the backup document.`,
          severity: 'error',
          details: { migrationId: entry.id, providerMappingId: mappingId },
        });
      }
    }
  }

  const installedProviderIds = new Set(doc.installedExtensions.map((e) => e.manifest.id));
  for (const identity of doc.mangaIdentities) {
    for (const mapping of identity.providerMappings) {
      if (!installedProviderIds.has(mapping.providerId)) {
        add(previewIssues, {
          code: 'restore.missing_installed_provider',
          message:
            'Backup references a provider mapping without a matching installed extension snapshot.',
          severity: 'warning',
          details: { providerId: mapping.providerId, mangaId: identity.id },
        });
      }
    }
  }

  const currentIdentityRows = db
    .select({ id: mangaIdentities.id, canonicalTitle: mangaIdentities.canonicalTitle })
    .from(mangaIdentities)
    .all();
  const currentById = new Map(currentIdentityRows.map((r) => [r.id, r.canonicalTitle]));

  for (const identity of doc.mangaIdentities) {
    const currentTitle = currentById.get(identity.id);
    if (currentTitle !== undefined && currentTitle !== identity.canonicalTitle) {
      add(previewIssues, {
        code: 'restore.identity_title_conflict',
        message: 'An identity with the same id already exists with a different canonical title.',
        severity: 'warning',
        details: { mangaId: identity.id },
      });
    }
  }

  const currentLibraryMangaIds = new Set(
    db
      .select({ mangaId: libraryEntries.mangaId })
      .from(libraryEntries)
      .all()
      .map((r) => r.mangaId),
  );
  const backupLibraryMangaIds = new Set(dedupedLibrary.library.map((e) => String(e.mangaId)));
  for (const mangaId of currentLibraryMangaIds) {
    if (!backupLibraryMangaIds.has(mangaId)) {
      add(previewIssues, {
        code: 'restore.destructive.library_removed',
        message:
          'A manga currently in the local library is not present in the backup library list.',
        severity: 'info',
        details: { mangaId },
      });
    }
  }

  // Restore replaces the whole themes table, so a backup without custom themes
  // (v1, or v2 exported with none) deletes every local custom theme.
  const localThemeCount = db.select({ id: themes.id }).from(themes).all().length;
  if (doc.themes.length === 0 && localThemeCount > 0) {
    add(previewIssues, {
      code: 'restore.destructive.themes_removed',
      message: 'Restoring this backup would remove every local custom theme.',
      severity: 'info',
      details: { count: localThemeCount },
    });
  }

  const currentInstalled = await listInstalledExtensions(db);
  const currentProviderIds = new Set(currentInstalled.map((e) => e.manifest.id));
  for (const ext of doc.installedExtensions) {
    if (currentProviderIds.has(ext.manifest.id) && ext.enabled === false) {
      add(previewIssues, {
        code: 'restore.provider_disabled_in_backup',
        message:
          'Backup would import a disabled extension record for a provider that is currently installed.',
        severity: 'info',
        details: { providerId: ext.manifest.id },
      });
    }
  }

  await Promise.all(
    doc.mangaIdentities.map(async (identity) => {
      const live = await getMangaIdentity(db, toMangaId(identity.id));
      if (
        live !== undefined &&
        live.defaultProviderMappingId !== identity.defaultProviderMappingId
      ) {
        add(previewIssues, {
          code: 'restore.default_mapping_change',
          message: 'Default provider mapping differs between backup and local database.',
          severity: 'info',
          details: { mangaId: identity.id },
        });
      }
    }),
  );

  const localReadStateCount = db
    .select({ chapterId: chapterReadState.chapterId })
    .from(chapterReadState)
    .all().length;
  const localHistoryCount = db.select({ id: readingHistory.id }).from(readingHistory).all().length;
  const localMigrationCount = db
    .select({ id: migrationHistory.id })
    .from(migrationHistory)
    .all().length;

  const localChapterCount = db.select({ id: chapters.id }).from(chapters).all().length;
  const counts: RestorePreviewCounts = {
    libraryEntries: dedupedLibrary.library.length,
    categories: doc.categories?.length ?? 0,
    categoryMemberships: membershipKeys.size,
    chapters: doc.chapters?.length ?? 0,
    chapterReadStates: doc.chapterReadStates?.length ?? 0,
    readingHistory: doc.readingHistory?.length ?? 0,
    migrationHistory: doc.migrationHistory?.length ?? 0,
  };

  if (doc.categories !== undefined) {
    const removed = [...localCategoryIds].filter((id) => !carriedCategoryIds.has(id)).length;
    if (removed > 0) {
      add(previewIssues, {
        code: 'restore.destructive.categories_removed',
        message: 'Restoring this backup would remove local categories the backup does not contain.',
        severity: 'info',
        details: { count: removed },
      });
    }
  }
  if (doc.chapterReadStates !== undefined && localReadStateCount > counts.chapterReadStates) {
    add(previewIssues, {
      code: 'restore.destructive.read_state_replaced',
      message: 'Restoring this backup would replace local chapter progress with the backup copy.',
      severity: 'info',
      details: { localCount: localReadStateCount, backupCount: counts.chapterReadStates },
    });
  }
  if (doc.readingHistory !== undefined && localHistoryCount > counts.readingHistory) {
    add(previewIssues, {
      code: 'restore.destructive.reading_history_replaced',
      message: 'Restoring this backup would replace local reading history with the backup copy.',
      severity: 'info',
      details: { localCount: localHistoryCount, backupCount: counts.readingHistory },
    });
  }
  if (doc.migrationHistory !== undefined && localMigrationCount > counts.migrationHistory) {
    add(previewIssues, {
      code: 'restore.destructive.migration_history_replaced',
      message: 'Restoring this backup would replace local migration history with the backup copy.',
      severity: 'info',
      details: { localCount: localMigrationCount, backupCount: counts.migrationHistory },
    });
  }
  if (doc.chapters !== undefined && localChapterCount > counts.chapters) {
    add(previewIssues, {
      code: 'restore.destructive.chapters_replaced',
      message: 'Restoring this backup would replace local chapter metadata with the backup copy.',
      severity: 'info',
      details: { localCount: localChapterCount, backupCount: counts.chapters },
    });
  }
  if (schemaVersion < BACKUP_SCHEMA_VERSION) {
    add(previewIssues, {
      code: 'restore.legacy_sections_preserved',
      message:
        'This backup predates categories, chapter metadata, chapter progress, reading history and migration history. Local records for those sections are kept.',
      severity: 'info',
      details: { schemaVersion },
    });
  }

  return {
    backupOk: true,
    backupIssues: [],
    previewIssues,
    schemaVersion,
    counts,
  };
}
