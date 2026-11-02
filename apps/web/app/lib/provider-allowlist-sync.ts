import type { AppDrizzleDb } from '@app/db';
import { listInstalledExtensions } from '@app/db/browser';
import type { AppResult } from '@app/shared';

import { createAppPlatformAdapter } from '../features/diagnostics/create-app-platform-adapter.js';

/** Providers this renderer has told main about; used to unregister the ones that go away. */
const registered = new Set<string>();

function adapter() {
  return createAppPlatformAdapter();
}

async function registerProviderNetwork(
  providerId: string,
  domains: readonly string[],
): Promise<AppResult<void>> {
  const result = await adapter().providerNetwork.registerProvider(providerId, domains);
  if (result.ok) registered.add(providerId);
  return result;
}

async function unregisterProviderNetwork(providerId: string): Promise<AppResult<void>> {
  const result = await adapter().providerNetwork.unregisterProvider(providerId);
  if (result.ok) registered.delete(providerId);
  return result;
}

/**
 * Mirror the installed, enabled providers' declared domains into main. A provider
 * without a `network` block is not registered, so main fails closed for it. Runs at
 * startup and after every install, import, enable, disable and uninstall. On the web
 * the adapter is a no-op; the browser keeps its own fetch.
 */
export async function syncProviderNetworkAllowlist(db: AppDrizzleDb): Promise<void> {
  // Best effort: a failed sync leaves main fail-closed for that provider, and the
  // next install, toggle or startup retries. It must never break the UI action.
  await syncInstalledProviders(db).catch((error: unknown) => {
    // oxlint-disable-next-line no-console -- ruling: provider-allowlist-sync-best-effort: the user-visible action succeeded; only the allowlist mirror failed, and this warn is the sole record before the next retry.
    console.warn('[provider-allowlist] sync failed:', error);
  });
}

async function syncInstalledProviders(db: AppDrizzleDb): Promise<void> {
  const installed = await listInstalledExtensions(db);
  const wanted = new Map<string, readonly string[]>();
  for (const entry of installed) {
    if (!entry.enabled) continue;
    const domains = entry.manifest.network?.domains;
    if (domains !== undefined && domains.length > 0) {
      wanted.set(String(entry.manifest.id), domains);
    }
  }

  const stale = [...registered].filter((providerId) => !wanted.has(providerId));
  // A failed unregister keeps the id in `registered`, so the next sync retries it.
  await Promise.all(stale.map((providerId) => unregisterProviderNetwork(providerId)));

  // Always replace: an updated manifest may widen or narrow its domains.
  await Promise.all(
    [...wanted].map(([providerId, domains]) => registerProviderNetwork(providerId, domains)),
  );
}
