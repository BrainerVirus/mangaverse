import type { AppResult, BackupDocumentV1, ExtensionInstallMetadata, MangaIdentity } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  validateBackupDocument,
  validateProviderManifest,
  validateReaderSettings,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import {
  installedExtensions,
  libraryCategoryMemberships,
  libraryEntries,
  mangaIdentities,
  mangaPeople,
  mangaProviderMappings,
  mangaTagMemberships,
  mangaTags,
  mangaTitles,
  providerSettings,
  readerPreferences,
  themePreferences,
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
      ...(identity.mergedFromIds !== undefined ? { mergedFromIdsJson: [...identity.mergedFromIds] } : {}),
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

function insertLibraryEntrySync(tx: AppDrizzleDb, entry: BackupDocumentV1['library'][number]): void {
  tx.insert(libraryEntries)
    .values({
      id: entry.id,
      mangaId: entry.mangaId,
      favorite: entry.favorite,
      status: entry.status,
      unreadCount: entry.unreadCount,
      ...(entry.lastReadChapterId !== undefined ? { lastReadChapterId: entry.lastReadChapterId } : {}),
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

function upsertReaderSettingsSync(tx: AppDrizzleDb, settings: BackupDocumentV1['readerSettings']): void {
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

function upsertThemeSettingsSync(tx: AppDrizzleDb, settings: BackupDocumentV1['themeSettings']): void {
  const now = new Date().toISOString();
  tx.insert(themePreferences)
    .values({
      id: GLOBAL_THEME_ID,
      presetId: settings.presetId,
      dark: settings.dark,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: themePreferences.id,
      set: { presetId: settings.presetId, dark: settings.dark, updatedAt: now },
    })
    .run();
}

/**
 * Replaces backup-covered local data with the validated backup document.
 * Chapter progress and categories are outside BackupDocumentV1 and are cleared with identities.
 */
export async function applyBackupRestore(db: AppDrizzleDb, input: unknown): Promise<AppResult<BackupDocumentV1>> {
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

  try {
    withTransaction(db, (tx) => {
      tx.delete(libraryCategoryMemberships).run();
      tx.delete(libraryEntries).run();
      tx.delete(mangaIdentities).run();
      tx.delete(installedExtensions).run();
      tx.delete(providerSettings).run();

      for (const identity of doc.mangaIdentities) {
        insertMangaIdentitySync(tx, identity);
      }
      for (const entry of doc.library) {
        insertLibraryEntrySync(tx, entry);
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

      upsertReaderSettingsSync(tx, doc.readerSettings);
      upsertThemeSettingsSync(tx, doc.themeSettings);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup restore failed.';
    return err(createAppError({ code: 'backup.restore.failed', message }));
  }

  return ok(doc);
}
