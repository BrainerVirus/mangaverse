import type { AppDrizzleDb } from '@app/db';

import type { MigrationCandidate, MigrationProviderOption } from './types.js';

export async function fetchMigrationProviders(db: AppDrizzleDb): Promise<MigrationProviderOption[]> {
  const { listInstalledExtensions } = await import('@app/db');
  const installed = await listInstalledExtensions(db);
  return installed
    .filter((ext) => ext.enabled && ext.state === 'installed')
    .map((ext) => ({
      id: ext.manifest.id,
      name: ext.manifest.name,
      enabled: ext.enabled,
    }))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchMigrationCandidates(
  db: AppDrizzleDb,
  sourceProviderId: string,
): Promise<MigrationCandidate[]> {
  const { listMigratableLibraryEntries } = await import('@app/db');
  const entries = await listMigratableLibraryEntries(db, sourceProviderId);
  return entries.map((entry) => ({
    mangaId: entry.mangaId,
    canonicalTitle: entry.canonicalTitle,
    sourceProviderMangaId: entry.sourceProviderMangaId,
    sourceMappingId: entry.sourceMappingId,
    isDefaultProvider: entry.isDefaultProvider,
    isActiveProvider: entry.isActiveProvider,
  }));
}
