import type { AppDrizzleDb } from '@app/db/browser';
import { listInstalledExtensions, upsertInstalledExtension } from '@app/db/browser';
import { MANGADEX_MANIFEST } from '@app/extensions/mangadex';
import {
  providerNetworkDomains,
  toExtensionInstallId,
  type ExtensionInstallMetadata,
  type ProviderManifest,
} from '@app/shared';

const FIRST_PARTY_MANIFESTS: readonly ProviderManifest[] = [MANGADEX_MANIFEST];

function sameDomains(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const a = [...(left ?? [])].sort();
  const b = [...(right ?? [])].sort();
  return a.length === b.length && a.every((domain, index) => domain === b[index]);
}

/**
 * Whether the bundled manifest carries content the stored copy lacks. A version
 * bump always refreshes, and so does a same-version edit to the network domains
 * or checksum: an older install may predate the `network` block entirely, and
 * without this refresh main would keep denying every request for it.
 */
function needsRefresh(existing: ExtensionInstallMetadata, bundled: ProviderManifest): boolean {
  return (
    existing.installedVersion !== bundled.version ||
    existing.manifest.checksum !== bundled.checksum ||
    !sameDomains(providerNetworkDomains(existing.manifest), providerNetworkDomains(bundled))
  );
}

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

    if (existing !== undefined && !needsRefresh(existing, manifest)) {
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

    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- ruling web-sequential-first-party-writes: these upserts share one sql.js handle, so they must not interleave, and a failed upsert stops the loop before the next manifest runs. Widen to Promise.all only if a manifest list that large ever lands.
    const result = await upsertInstalledExtension(db, metadata);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
}
