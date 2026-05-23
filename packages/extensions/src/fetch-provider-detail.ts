import type { AppDrizzleDb } from '@app/db';

import type { ProviderDetailData } from './types.js';

export async function fetchProviderDetail(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderDetailData | null> {
  const { buildCapabilityDisplay, buildPermissionDisplay, getProviderSettings, listInstalledProviders } =
    await import('@app/extensions-core');

  const list = await listInstalledProviders(db);
  if (!list.ok) {
    throw list.error;
  }

  const provider = list.value.find((entry) => entry.id === providerId);
  if (provider === undefined) {
    return null;
  }

  const settingsResult = await getProviderSettings(providerId, { db });
  if (!settingsResult.ok) {
    throw settingsResult.error;
  }

  return {
    provider,
    capabilities: buildCapabilityDisplay(provider.manifest),
    permissions: buildPermissionDisplay(provider.manifest),
    settings: settingsResult.value,
  };
}
