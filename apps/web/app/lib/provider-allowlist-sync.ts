import type { AppDrizzleDb } from '@app/db';
import { listInstalledExtensions } from '@app/db/browser';
import type { ProviderNetworkRegistration } from '@app/platform';

import { createAppPlatformAdapter } from '../features/diagnostics/create-app-platform-adapter.js';

/**
 * Serializes allowlist syncs and stamps each with a strictly increasing revision.
 * Main keeps the newest revision, so even if a call were reordered on the wire an
 * older snapshot could never re-register a provider that a newer one disabled.
 */
let queue: Promise<void> = Promise.resolve();
let lastRevision = 0;

function nextRevision(): number {
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  return lastRevision;
}

/**
 * Mirror the installed, enabled providers' declared domains into main as a full
 * snapshot. Main replaces its table with exactly this set, so a provider that was
 * disabled or uninstalled is removed even though this renderer remembers nothing
 * across a reload. Runs at startup and after every install, import, enable, disable
 * and uninstall. On the web the adapter is a no-op; the browser keeps its own fetch.
 */
export function syncProviderNetworkAllowlist(db: AppDrizzleDb): Promise<void> {
  const revision = nextRevision();
  const run = queue
    .then(() => syncInstalledProviders(db, revision))
    .catch((error: unknown) => {
      // Best effort: a failed sync leaves main fail-closed for that provider, and the
      // next install, toggle or startup retries. It must never break the UI action.
      // oxlint-disable-next-line no-console -- ruling: provider-allowlist-sync-best-effort: the user-visible action succeeded; only the allowlist mirror failed, and this warn is the sole record before the next retry.
      console.warn('[provider-allowlist] sync failed:', error);
    });
  queue = run;
  return run;
}

async function syncInstalledProviders(db: AppDrizzleDb, revision: number): Promise<void> {
  const installed = await listInstalledExtensions(db);
  const snapshot: ProviderNetworkRegistration[] = [];
  for (const entry of installed) {
    if (!entry.enabled) continue;
    const domains = entry.manifest.network?.domains;
    if (domains !== undefined && domains.length > 0) {
      snapshot.push({ providerId: String(entry.manifest.id), domains });
    }
  }

  const result = await createAppPlatformAdapter().providerNetwork.replaceProviders(
    snapshot,
    revision,
  );
  if (!result.ok) {
    throw new Error(result.error.message);
  }
}
