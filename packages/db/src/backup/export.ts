import type { BackupDocumentV1, BackupMetadata, BackupSettingsSnapshot } from '@app/shared';
import { BACKUP_SCHEMA_VERSION, toProviderId } from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { providerSettings } from '../schema.js';
import { listMangaIdentities } from '../repositories/identities.js';
import { listInstalledExtensions } from '../repositories/extensions.js';
import { listLibraryEntries } from '../repositories/library.js';
import { getReaderSettings, getThemeSettings } from '../repositories/settings.js';

export async function exportBackupDocumentV1(
  db: AppDrizzleDb,
  metadata: BackupMetadata,
): Promise<BackupDocumentV1> {
  const [library, mangaIdentities, installedExtensions, readerSettings, themeSettings] = await Promise.all([
    listLibraryEntries(db),
    listMangaIdentities(db),
    listInstalledExtensions(db),
    getReaderSettings(db),
    getThemeSettings(db),
  ]);

  const providerRows = await db.select().from(providerSettings).all();
  const providerSnapshots = providerRows.map((r) => ({
    providerId: toProviderId(r.providerId),
    ...(r.label !== null && r.label !== undefined && r.label !== '' ? { label: r.label } : {}),
    settings: r.settingsJson,
  }));

  const providerSettingsOut: BackupSettingsSnapshot = { providerSnapshots };

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    metadata,
    library,
    mangaIdentities,
    installedExtensions,
    readerSettings,
    providerSettings: providerSettingsOut,
    themeSettings,
  };
}
