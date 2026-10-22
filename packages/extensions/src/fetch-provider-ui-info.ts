import type { AppDrizzleDb } from '@app/db';
import type { ProviderCapabilityMap } from '@app/shared';

export interface ProviderUiInfo {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly capabilities: ProviderCapabilityMap;
}

/**
 * Display names and declared capabilities for provider-attributed UI. Callers
 * gate optional provider calls on the capability map instead of guessing.
 */
export async function fetchProviderUiInfo(db: AppDrizzleDb): Promise<ProviderUiInfo[]> {
  const { listInstalledExtensions } = await import('@app/db');
  const providers = await listInstalledExtensions(db);
  return providers
    .map((provider) => ({
      id: String(provider.manifest.id),
      name: provider.manifest.name,
      enabled: provider.enabled,
      capabilities: provider.manifest.capabilities,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
