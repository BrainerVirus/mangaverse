import type { AppDrizzleDb } from '@app/db/browser';
import { listInstalledExtensions } from '@app/db/browser';
import { createMangaDexProvider } from '@app/extensions-mangadex';
import type { ProviderContract } from '@app/extensions-sdk';

/**
 * Resolves the runtime contract for an installed and enabled provider.
 * Disabled or unknown providers resolve to null — no remote call may happen
 * through a provider the user turned off.
 */
export async function resolveInstalledProvider(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderContract | null> {
  const installed = await listInstalledExtensions(db);
  const entry = installed.find(
    (item) => String(item.manifest.id) === providerId && item.enabled,
  );
  if (entry === undefined) {
    return null;
  }

  if (providerId === 'mangadex') {
    return createMangaDexProvider();
  }

  return null;
}
