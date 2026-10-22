import type {
  AppResult,
  AppSettings,
  BackupChapter,
  BackupDocumentV1,
  BackupMigrationHistoryEntry,
  BackupReadingHistoryEntry,
  ChapterReadState,
  ExtensionInstallMetadata,
  LibraryCategory,
  MangaIdentity,
} from '@app/shared';
import {
  APP_SETTINGS_STORAGE_KEY,
  createAppError,
  dedupeBackupLibrary,
  err,
  ok,
  validateAppSettings,
  validateBackupDocument,
  validateProviderManifest,
  validateReaderSettings,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import {
  appSettings,
  categories,
  chapterReadState,
  chapters,
  installedExtensions,
  libraryCategoryMemberships,
  libraryEntries,
  mangaIdentities,
  mangaPeople,
  mangaProviderMappings,
  mangaTagMemberships,
  mangaTags,
  mangaTitles,
  migrationHistory,
  providerSettings,
  readerPreferences,
  readingHistory,
  themePreferences,
  themes,
  trackingLinks,
} from '../schema.js';
import { withTransaction } from '../transactions.js';
import { previewBackupRestore } from './restore-preview.js';

const GLOBAL_READER_ID = 'global' as const;
const GLOBAL_THEME_ID = 'global' as const;

function newRowId(): string {
  return crypto.randomUUID();
}

function insertMangaIdentitySync(tx: AppDrizzleDb, identity: MangaIdentity): void {
  tx.insert(mangaIdentities)
    .values({
      id: identity.id,
      canonicalTitle: identity.canonicalTitle,
      status: identity.status,
      contentRating: identity.contentRating,
      merged: identity.merged,
      defaultProviderMappingId: identity.defaultProviderMappingId,
      ...(identity.language !== undefined ? { language: identity.language } : {}),
      ...(identity.description !== undefined ? { description: identity.description } : {}),
      ...(identity.coverImageUrl !== undefined ? { coverImageUrl: identity.coverImageUrl } : {}),
      ...(identity.preferredChapterSourceId !== undefined
        ? { preferredChapterSourceId: identity.preferredChapterSourceId }
        : {}),
      ...(identity.userOverrides !== undefined
        ? { userOverridesJson: identity.userOverrides as Record<string, unknown> }
        : {}),
      ...(identity.mergedFromIds !== undefined
        ? { mergedFromIdsJson: [...identity.mergedFromIds] }
        : {}),
      ...(identity.createdAt !== undefined ? { createdAt: identity.createdAt } : {}),
      ...(identity.updatedAt !== undefined ? { updatedAt: identity.updatedAt } : {}),
    })
    .run();

  for (const mapping of identity.providerMappings) {
    tx.insert(mangaProviderMappings)
      .values({
        id: mapping.id,
        mangaId: identity.id,
        providerId: mapping.providerId,
        providerMangaId: mapping.providerMangaId,
        ...(mapping.providerTitle !== undefined ? { providerTitle: mapping.providerTitle } : {}),
        ...(mapping.providerUrl !== undefined ? { providerUrl: mapping.providerUrl } : {}),
        ...(mapping.lastSyncedAt !== undefined ? { lastSyncedAt: mapping.lastSyncedAt } : {}),
      })
      .run();
  }

  for (const title of identity.alternativeTitles) {
    tx.insert(mangaTitles)
      .values({
        id: newRowId(),
        mangaId: identity.id,
        value: title.value,
        ...(title.locale !== undefined ? { locale: title.locale } : {}),
      })
      .run();
  }

  for (const author of identity.authors) {
    tx.insert(mangaPeople)
      .values({
        id: newRowId(),
        mangaId: identity.id,
        name: author.name,
        kind: 'author',
        ...(author.role !== undefined ? { role: author.role } : {}),
      })
      .run();
  }

  for (const artist of identity.artists) {
    tx.insert(mangaPeople)
      .values({
        id: newRowId(),
        mangaId: identity.id,
        name: artist.name,
        kind: 'artist',
        ...(artist.role !== undefined ? { role: artist.role } : {}),
      })
      .run();
  }

  for (const tag of identity.tags) {
    const tagId = tag.id ?? newRowId();
    tx.insert(mangaTags)
      .values({
        id: tagId,
        label: tag.label,
        ...(tag.namespace !== undefined ? { namespace: tag.namespace } : {}),
      })
      .onConflictDoNothing()
      .run();
    tx.insert(mangaTagMemberships)
      .values({
        mangaId: identity.id,
        tagId,
      })
      .run();
  }

  if (identity.trackingLinks !== undefined) {
    for (const link of identity.trackingLinks) {
      tx.insert(trackingLinks)
        .values({
          id: newRowId(),
          mangaId: identity.id,
          service: link.service,
          externalId: link.externalId,
          ...(link.externalUrl !== undefined ? { externalUrl: link.externalUrl } : {}),
          ...(link.lastSyncedAt !== undefined ? { lastSyncedAt: link.lastSyncedAt } : {}),
        })
        .run();
    }
  }
}

function insertLibraryEntrySync(
  tx: AppDrizzleDb,
  entry: BackupDocumentV1['library'][number],
): void {
  tx.insert(libraryEntries)
    .values({
      id: entry.id,
      mangaId: entry.mangaId,
      favorite: entry.favorite,
      status: entry.status,
      unreadCount: entry.unreadCount,
      ...(entry.lastReadChapterId !== undefined
        ? { lastReadChapterId: entry.lastReadChapterId }
        : {}),
      ...(entry.activeProviderMappingId !== undefined
        ? { activeProviderMappingId: entry.activeProviderMappingId }
        : {}),
      ...(entry.progressPercent !== undefined ? { progressPercent: entry.progressPercent } : {}),
      ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
      ...(entry.addedAt !== undefined ? { addedAt: entry.addedAt } : {}),
      ...(entry.updatedAt !== undefined ? { updatedAt: entry.updatedAt } : {}),
    })
    .run();
}

function insertCategorySync(tx: AppDrizzleDb, category: LibraryCategory): void {
  tx.insert(categories)
    .values({
      id: category.id,
      name: category.name,
      ...(category.color !== undefined ? { color: category.color } : {}),
      pinned: category.pinned === true,
      ...(category.sortIndex !== undefined ? { sortIndex: category.sortIndex } : {}),
      ...(category.createdAt !== undefined ? { createdAt: category.createdAt } : {}),
      ...(category.updatedAt !== undefined ? { updatedAt: category.updatedAt } : {}),
    })
    .run();
}

type ChapterReadStateRow = typeof chapterReadState.$inferInsert;
type ReadingHistoryRow = typeof readingHistory.$inferInsert;
type MigrationHistoryRow = typeof migrationHistory.$inferInsert;

function insertChapterRowSync(tx: AppDrizzleDb, chapter: BackupChapter): void {
  tx.insert(chapters)
    .values({
      id: chapter.id,
      mangaId: chapter.mangaId,
      providerMappingId: chapter.providerMappingId,
      ...(chapter.providerId !== undefined ? { providerId: chapter.providerId } : {}),
      ...(chapter.providerChapterId !== undefined
        ? { providerChapterId: chapter.providerChapterId }
        : {}),
      title: chapter.title,
      chapterIndex: chapter.index,
      ...(chapter.volume !== undefined ? { volume: chapter.volume } : {}),
      ...(chapter.publishedAt !== undefined ? { publishedAt: chapter.publishedAt } : {}),
      ...(chapter.createdAt !== undefined ? { createdAt: chapter.createdAt } : {}),
      ...(chapter.updatedAt !== undefined ? { updatedAt: chapter.updatedAt } : {}),
    })
    .run();
}

function backupChapterFromRow(row: typeof chapters.$inferSelect): BackupChapter {
  return {
    id: row.id as BackupChapter['id'],
    mangaId: row.mangaId as BackupChapter['mangaId'],
    providerMappingId: row.providerMappingId as BackupChapter['providerMappingId'],
    ...(row.providerId !== null && row.providerId !== undefined && row.providerId !== ''
      ? { providerId: row.providerId as NonNullable<BackupChapter['providerId']> }
      : {}),
    ...(row.providerChapterId !== null &&
    row.providerChapterId !== undefined &&
    row.providerChapterId !== ''
      ? { providerChapterId: row.providerChapterId }
      : {}),
    title: row.title,
    index: row.chapterIndex,
    ...(row.volume !== null && row.volume !== undefined && row.volume !== ''
      ? { volume: row.volume }
      : {}),
    ...(row.publishedAt !== null && row.publishedAt !== undefined && row.publishedAt !== ''
      ? { publishedAt: row.publishedAt }
      : {}),
    ...(row.createdAt !== null && row.createdAt !== undefined && row.createdAt !== ''
      ? { createdAt: row.createdAt }
      : {}),
    ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== ''
      ? { updatedAt: row.updatedAt }
      : {}),
  };
}

function insertChapterReadStateRowSync(tx: AppDrizzleDb, row: ChapterReadStateRow): void {
  tx.insert(chapterReadState).values(row).run();
}

function insertReadingHistoryRowSync(tx: AppDrizzleDb, row: ReadingHistoryRow): void {
  tx.insert(readingHistory).values(row).run();
}

function insertMigrationHistoryRowSync(tx: AppDrizzleDb, row: MigrationHistoryRow): void {
  tx.insert(migrationHistory).values(row).run();
}

function readStateRowFromBackup(state: ChapterReadState): ChapterReadStateRow {
  return {
    chapterId: state.chapterId,
    mangaId: state.mangaId,
    ...(state.providerMappingId !== undefined
      ? { providerMappingId: state.providerMappingId }
      : {}),
    readPercent: state.progress.readPercent,
    lastPageIndex: state.progress.lastPageIndex,
    completed: state.progress.completed,
    ...(state.progress.startedAt !== undefined ? { startedAt: state.progress.startedAt } : {}),
    ...(state.progress.updatedAt !== undefined ? { updatedAt: state.progress.updatedAt } : {}),
  };
}

function readingHistoryRowFromBackup(entry: BackupReadingHistoryEntry): ReadingHistoryRow {
  return {
    id: entry.id,
    mangaId: entry.mangaId,
    chapterId: entry.chapterId,
    readAt: entry.readAt,
    ...(entry.providerMappingId !== undefined
      ? { providerMappingId: entry.providerMappingId }
      : {}),
  };
}

function migrationHistoryRowFromBackup(entry: BackupMigrationHistoryEntry): MigrationHistoryRow {
  return {
    id: entry.id,
    mangaId: entry.mangaId,
    sourceProviderId: entry.sourceProviderId,
    sourceProviderMangaId: entry.sourceProviderMangaId,
    targetProviderId: entry.targetProviderId,
    targetProviderMangaId: entry.targetProviderMangaId,
    completedAt: entry.completedAt,
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
    ...(entry.batchId !== undefined ? { batchId: entry.batchId } : {}),
    ...(entry.previousDefaultMappingId !== undefined
      ? { previousDefaultMappingId: entry.previousDefaultMappingId }
      : {}),
    ...(entry.previousActiveMappingId !== undefined
      ? { previousActiveMappingId: entry.previousActiveMappingId }
      : {}),
  };
}

function upsertInstalledExtensionSync(tx: AppDrizzleDb, metadata: ExtensionInstallMetadata): void {
  const manifestResult = validateProviderManifest(metadata.manifest);
  if (!manifestResult.ok) {
    throw new Error(manifestResult.error.message);
  }

  const now = new Date().toISOString();
  tx.insert(installedExtensions)
    .values({
      id: metadata.id,
      manifestJson: manifestResult.value as unknown as Record<string, unknown>,
      sourceUrl: metadata.sourceUrl,
      registryUrl: metadata.registryUrl,
      checksum: metadata.checksum,
      installedVersion: metadata.installedVersion,
      enabled: metadata.enabled,
      installedAt: metadata.installedAt,
      updatedAt: metadata.updatedAt ?? now,
      state: metadata.state,
      health: metadata.health,
      warningsJson: [...metadata.warnings],
    })
    .onConflictDoUpdate({
      target: installedExtensions.id,
      set: {
        manifestJson: manifestResult.value as unknown as Record<string, unknown>,
        sourceUrl: metadata.sourceUrl,
        registryUrl: metadata.registryUrl,
        checksum: metadata.checksum,
        installedVersion: metadata.installedVersion,
        enabled: metadata.enabled,
        updatedAt: metadata.updatedAt ?? now,
        state: metadata.state,
        health: metadata.health,
        warningsJson: [...metadata.warnings],
      },
    })
    .run();
}

function upsertReaderSettingsSync(
  tx: AppDrizzleDb,
  settings: BackupDocumentV1['readerSettings'],
): void {
  const parsed = validateReaderSettings(settings);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  const now = new Date().toISOString();
  tx.insert(readerPreferences)
    .values({
      id: GLOBAL_READER_ID,
      settingsJson: parsed.value as unknown as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: readerPreferences.id,
      set: { settingsJson: parsed.value as unknown as Record<string, unknown>, updatedAt: now },
    })
    .run();
}

function upsertThemeSettingsSync(
  tx: AppDrizzleDb,
  settings: BackupDocumentV1['themeSettings'],
): void {
  const now = new Date().toISOString();
  tx.insert(themePreferences)
    .values({
      id: GLOBAL_THEME_ID,
      presetId: settings.themeId,
      dark: settings.dark,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: themePreferences.id,
      set: { presetId: settings.themeId, dark: settings.dark, updatedAt: now },
    })
    .run();
}

/**
 * App settings are absent from v1 and v2 backups: those leave local preferences
 * untouched instead of resetting them to defaults.
 */
function upsertAppSettingsSync(tx: AppDrizzleDb, settings: AppSettings): void {
  const parsed = validateAppSettings(settings);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  const now = new Date().toISOString();
  tx.insert(appSettings)
    .values({ key: APP_SETTINGS_STORAGE_KEY, valueJson: parsed.value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: parsed.value, updatedAt: now },
    })
    .run();
}

/**
 * Replaces backup-covered local data with the validated backup document.
 *
 * v4 documents replace categories, category links, chapter read state, reading
 * history and migration history. Older documents carry none of those sections:
 * their local rows are kept for the manga identities the restore keeps, instead
 * of being cleared. Category links in older documents resolve against the local
 * categories and unknown ids are skipped (the preview reports them). A library
 * resume pointer whose chapter the restore does not keep is cleared so the next
 * v4 export stays valid.
 */
export async function applyBackupRestore(
  db: AppDrizzleDb,
  input: unknown,
): Promise<AppResult<BackupDocumentV1>> {
  const validation = validateBackupDocument(input);
  if (!validation.ok) {
    return err(createAppError({ code: 'backup.invalid', message: validation.error.message }));
  }

  const preview = await previewBackupRestore(db, input);
  if (!preview.backupOk) {
    return err(createAppError({ code: 'backup.invalid', message: 'Backup validation failed.' }));
  }

  const blockingIssues = preview.previewIssues.filter((issue) => issue.severity === 'error');
  if (blockingIssues.length > 0) {
    return err(
      createAppError({
        code: 'backup.restore.blocked',
        message: blockingIssues[0]!.message,
        details: { issueCount: blockingIssues.length },
      }),
    );
  }

  const doc = validation.value;

  // Legacy backups did not carry these sections. Snapshot the local rows so the
  // identity cascade cannot delete progress the document never described.
  const legacyChapters = doc.chapters === undefined ? db.select().from(chapters).all() : [];
  const legacyReadStates =
    doc.chapterReadStates === undefined ? db.select().from(chapterReadState).all() : [];
  const legacyReadingHistory =
    doc.readingHistory === undefined ? db.select().from(readingHistory).all() : [];
  const legacyMigrationHistory =
    doc.migrationHistory === undefined ? db.select().from(migrationHistory).all() : [];
  const identityIds = new Set<string>(doc.mangaIdentities.map((identity) => identity.id));
  const mappingIds = new Set<string>(
    doc.mangaIdentities.flatMap((identity) =>
      identity.providerMappings.map((mapping) => mapping.id),
    ),
  );

  // v4 carries its chapters; older documents keep the local chapters whose manga
  // and mapping the restore retains. Anything else is dropped, so a resume
  // pointer to it must drop too or the next v4 export fails its own preview.
  const keptChapterIds =
    doc.chapters !== undefined
      ? new Set(doc.chapters.map((chapter) => chapter.id))
      : new Set(
          legacyChapters
            .filter((row) => identityIds.has(row.mangaId) && mappingIds.has(row.providerMappingId))
            .map((row) => row.id),
        );
  // The unique index allows one row per manga; dedupe here too so a direct
  // apply (without a caller preview) cannot fail on a pre-0003 backup.
  const library = dedupeBackupLibrary(doc.library).library.map((entry) => {
    if (entry.lastReadChapterId === undefined || keptChapterIds.has(entry.lastReadChapterId)) {
      return entry;
    }
    const {
      lastReadChapterId: _droppedChapterId,
      progressPercent: _droppedProgress,
      ...rest
    } = entry;
    return rest;
  });

  try {
    withTransaction(db, (tx) => {
      tx.delete(libraryCategoryMemberships).run();
      tx.delete(readingHistory).run();
      tx.delete(chapterReadState).run();
      tx.delete(migrationHistory).run();
      tx.delete(chapters).run();
      tx.delete(libraryEntries).run();
      tx.delete(mangaIdentities).run();
      tx.delete(installedExtensions).run();
      tx.delete(providerSettings).run();
      tx.delete(themes).run();
      if (doc.categories !== undefined) {
        tx.delete(categories).run();
      }

      // Progress for a chapter the restore drops must not survive: an orphan
      // read-state row makes the next v4 export fail its own preview.
      for (const identity of doc.mangaIdentities) {
        insertMangaIdentitySync(tx, identity);
      }
      if (doc.chapters !== undefined) {
        for (const chapter of doc.chapters) {
          insertChapterRowSync(tx, chapter);
        }
      } else {
        // Chapters are metadata only; pages are rehydrated by the provider.
        for (const row of legacyChapters) {
          if (!identityIds.has(row.mangaId) || !mappingIds.has(row.providerMappingId)) continue;
          insertChapterRowSync(tx, backupChapterFromRow(row));
        }
      }
      for (const category of doc.categories ?? []) {
        insertCategorySync(tx, category);
      }
      for (const entry of library) {
        insertLibraryEntrySync(tx, entry);
      }

      // v4 restores link against the carried definitions; older backups can only
      // link categories that already exist locally.
      const knownCategoryIds = new Set(
        doc.categories !== undefined
          ? doc.categories.map((category) => category.id)
          : tx
              .select({ id: categories.id })
              .from(categories)
              .all()
              .map((row) => row.id),
      );
      for (const entry of library) {
        for (const categoryId of new Set(entry.categoryIds)) {
          if (!knownCategoryIds.has(categoryId)) continue;
          tx.insert(libraryCategoryMemberships)
            .values({ libraryEntryId: entry.id, categoryId })
            .run();
        }
      }

      if (doc.chapterReadStates !== undefined) {
        for (const state of doc.chapterReadStates) {
          insertChapterReadStateRowSync(tx, readStateRowFromBackup(state));
        }
      } else {
        for (const row of legacyReadStates) {
          if (identityIds.has(row.mangaId) && keptChapterIds.has(row.chapterId)) {
            insertChapterReadStateRowSync(tx, row);
          }
        }
      }

      if (doc.readingHistory !== undefined) {
        for (const entry of doc.readingHistory) {
          insertReadingHistoryRowSync(tx, readingHistoryRowFromBackup(entry));
        }
      } else {
        for (const row of legacyReadingHistory) {
          if (identityIds.has(row.mangaId) && keptChapterIds.has(row.chapterId)) {
            insertReadingHistoryRowSync(tx, row);
          }
        }
      }

      if (doc.migrationHistory !== undefined) {
        for (const entry of doc.migrationHistory) {
          insertMigrationHistoryRowSync(tx, migrationHistoryRowFromBackup(entry));
        }
      } else {
        for (const row of legacyMigrationHistory) {
          if (identityIds.has(row.mangaId)) insertMigrationHistoryRowSync(tx, row);
        }
      }

      for (const extension of doc.installedExtensions) {
        upsertInstalledExtensionSync(tx, extension);
      }
      for (const snapshot of doc.providerSettings.providerSnapshots) {
        const now = new Date().toISOString();
        tx.insert(providerSettings)
          .values({
            providerId: snapshot.providerId,
            label: snapshot.label,
            settingsJson: snapshot.settings,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: providerSettings.providerId,
            set: {
              label: snapshot.label,
              settingsJson: snapshot.settings,
              updatedAt: now,
            },
          })
          .run();
      }

      for (const definition of doc.themes) {
        const now = new Date().toISOString();
        tx.insert(themes)
          .values({
            id: definition.id,
            name: definition.name,
            definitionJson: definition,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      upsertReaderSettingsSync(tx, doc.readerSettings);
      upsertThemeSettingsSync(tx, doc.themeSettings);
      if (doc.appSettings !== undefined) {
        upsertAppSettingsSync(tx, doc.appSettings);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup restore failed.';
    return err(createAppError({ code: 'backup.restore.failed', message }));
  }

  return ok({ ...doc, library });
}
