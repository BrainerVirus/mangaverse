import type { AppDrizzleDb } from '../adapter.js';
import {
  categories,
  installedExtensions,
  libraryEntries,
  mangaIdentities,
  providerSettings,
} from '../schema.js';

export interface LocalDatabaseSummary {
  readonly libraryEntryCount: number;
  readonly mangaIdentityCount: number;
  readonly installedExtensionCount: number;
  readonly enabledExtensionCount: number;
  readonly brokenExtensionCount: number;
  readonly categoryCount: number;
  readonly providerSettingsCount: number;
}

export async function summarizeLocalDatabase(db: AppDrizzleDb): Promise<LocalDatabaseSummary> {
  const [
    libraryRows,
    identityRows,
    extensionRows,
    categoryRows,
    providerSettingsRows,
  ] = await Promise.all([
    db.select({ id: libraryEntries.id }).from(libraryEntries).all(),
    db.select({ id: mangaIdentities.id }).from(mangaIdentities).all(),
    db.select({ enabled: installedExtensions.enabled, health: installedExtensions.health }).from(installedExtensions).all(),
    db.select({ id: categories.id }).from(categories).all(),
    db.select({ providerId: providerSettings.providerId }).from(providerSettings).all(),
  ]);

  return {
    libraryEntryCount: libraryRows.length,
    mangaIdentityCount: identityRows.length,
    installedExtensionCount: extensionRows.length,
    enabledExtensionCount: extensionRows.filter((row) => row.enabled).length,
    brokenExtensionCount: extensionRows.filter((row) => row.health === 'broken').length,
    categoryCount: categoryRows.length,
    providerSettingsCount: providerSettingsRows.length,
  };
}
