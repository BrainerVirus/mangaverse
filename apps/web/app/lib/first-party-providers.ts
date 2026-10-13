import type { AppDrizzleDb } from '@app/db/browser';
import { listInstalledExtensions, upsertInstalledExtension } from '@app/db/browser';
import { MANGADEX_MANIFEST } from '@app/extensions-mangadex';
import { toExtensionInstallId, type ExtensionInstallMetadata, type ProviderManifest } from '@app/shared';

const FIRST_PARTY_MANIFESTS: readonly ProviderManifest[] = [MANGADEX_MANIFEST];

/**
 * Registers bundled first-party providers on app start.
 *
 * Unlike community installs this needs no network fetch — the manifest ships
 * with the app — and it never re-enables a provider the user disabled: an
 * existing entry only gets its manifest content and version refreshed.
 */
export async function installFirstPartyProviders(db: AppDrizzleDb): Promise<void> {
  const installed = await listInstalledExtensions(db);
  const now = new Date().toISOString();

  for (const manifest of FIRST_PARTY_MANIFESTS) {
    const existing = installed.find((entry) => String(entry.manifest.id) === String(manifest.id));

    if (existing !== undefined && existing.installedVersion === manifest.version) {
      continue;
    }

    const metadata: ExtensionInstallMetadata =
      existing !== undefined
        ? {
            ...existing,
            manifest,
            installedVersion: manifest.version,
            updatedAt: now,
          }
        : {
            id: toExtensionInstallId(String(manifest.id)),
            manifest,
            sourceUrl: manifest.source.url,
            installedVersion: manifest.version,
            enabled: true,
            installedAt: now,
            updatedAt: now,
            state: 'installed',
            health: 'ok',
            warnings: [],
          };

    const result = await upsertInstalledExtension(db, metadata);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
}
