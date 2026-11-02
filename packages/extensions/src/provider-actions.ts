import type { AppDrizzleDb } from '@app/db';
import type { AppResult } from '@app/shared';

export async function setProviderEnabled(
  db: AppDrizzleDb,
  providerId: string,
  enabled: boolean,
): Promise<AppResult<void>> {
  const { disableInstalledProvider, enableInstalledProvider } = await import('./core/index.js');
  if (enabled) {
    return enableInstalledProvider(providerId, { db });
  }
  return disableInstalledProvider(providerId, { db });
}

export async function removeProvider(
  db: AppDrizzleDb,
  providerId: string,
): Promise<AppResult<void>> {
  const { uninstallInstalledProvider } = await import('./core/index.js');
  return uninstallInstalledProvider(providerId, { db });
}
