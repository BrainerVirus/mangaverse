import type { BackupDocumentV1, BackupMetadata, BackupSettingsSnapshot } from '@app/shared';
import {
  BACKUP_SCHEMA_VERSION,
  toChapterId,
  toMangaId,
  toProviderId,
  toProviderMappingId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { chapters, providerSettings } from '../schema.js';
import { listMangaIdentities } from '../repositories/identities.js';
import { listInstalledExtensions } from '../repositories/extensions.js';
import { listLibraryCategories, listLibraryEntries } from '../repositories/library.js';
import { listMigrationHistory } from '../repositories/migration-history.js';
import { listChapterReadStates, listReadingHistory } from '../repositories/read-state.js';
import { getAppSettings, getReaderSettings, getThemeSettings } from '../repositories/settings.js';
import { listThemeDefinitions } from '../repositories/themes.js';

export async function exportBackupDocumentV1(
  db: AppDrizzleDb,
  metadata: BackupMetadata,
): Promise<BackupDocumentV1> {
  const [
    library,
    mangaIdentities,
    installedExtensions,
    readerSettings,
    appSettings,
    themeSettings,
    themes,
    categories,
    chapterReadStates,
    readingHistory,
    migrationHistory,
  ] = await Promise.all([
    listLibraryEntries(db),
    listMangaIdentities(db),
    listInstalledExtensions(db),
    getReaderSettings(db),
    getAppSettings(db),
    getThemeSettings(db),
    listThemeDefinitions(db),
    listLibraryCategories(db),
    listChapterReadStates(db),
    listReadingHistory(db),
    listMigrationHistory(db, undefined),
  ]);

  const providerRows = db.select().from(providerSettings).all();
  const providerSnapshots = providerRows.map((r) => ({
    providerId: toProviderId(r.providerId),
    ...(r.label !== null && r.label !== undefined && r.label !== '' ? { label: r.label } : {}),
    settings: r.settingsJson,
  }));

  const providerSettingsOut: BackupSettingsSnapshot = { providerSnapshots };

  const chapterRows = db
    .select()
    .from(chapters)
    .orderBy(chapters.mangaId, chapters.chapterIndex)
    .all();

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    metadata,
    library,
    mangaIdentities,
    installedExtensions,
    readerSettings,
    providerSettings: providerSettingsOut,
    themeSettings,
    themes,
    appSettings,
    categories,
    chapters: chapterRows.map((row) => ({
      id: toChapterId(row.id),
      mangaId: toMangaId(row.mangaId),
      providerMappingId: toProviderMappingId(row.providerMappingId),
      ...(row.providerId !== null && row.providerId !== undefined && row.providerId !== ''
        ? { providerId: toProviderId(row.providerId) }
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
    })),
    chapterReadStates,
    readingHistory,
    // Titles are resolved from the restored identity; the history table stores ids only.
    migrationHistory: migrationHistory.map(
      ({
        canonicalTitle: _title,
        previousDefaultMappingId,
        previousActiveMappingId,
        ...entry
      }) => ({
        ...entry,
        mangaId: toMangaId(entry.mangaId),
        sourceProviderId: toProviderId(entry.sourceProviderId),
        targetProviderId: toProviderId(entry.targetProviderId),
        ...(previousDefaultMappingId !== undefined
          ? { previousDefaultMappingId: toProviderMappingId(previousDefaultMappingId) }
          : {}),
        ...(previousActiveMappingId !== undefined
          ? { previousActiveMappingId: toProviderMappingId(previousActiveMappingId) }
          : {}),
      }),
    ),
  };
}
