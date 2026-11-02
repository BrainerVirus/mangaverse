import type { AppDrizzleDb } from '@app/db';
import { listInstalledExtensions } from '@app/db/browser';
import type { ProviderNetworkRegistration } from '@app/platform';

import { createAppPlatformAdapter } from '../features/diagnostics/create-app-platform-adapter.js';
import { feedback } from './app-feedback.js';

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
 * across a reload. Runs at startup and after every install, import, update, enable,
 * disable and uninstall. On the web the adapter is a no-op; the browser keeps its
 * own fetch. A failure rejects: main keeps its previous table, so the caller must
 * report it, and the next sync (or the user's retry) sends the snapshot again.
 */
export function syncProviderNetworkAllowlist(db: AppDrizzleDb): Promise<void> {
  const revision = nextRevision();
  const run = queue.then(() => syncInstalledProviders(db, revision));
  // A failed sync must not wedge the ones queued after it.
  queue = run.catch(() => undefined);
  return run;
}

/**
 * For an action that already succeeded (install, import, startup): run the sync
 * and, if it fails, tell the user with a retry instead of dropping the failure.
 * Main keeps its previous table, so the new provider stays unreachable until then.
 */
export function syncProviderNetworkAllowlistReported(db: AppDrizzleDb): Promise<void> {
  return syncProviderNetworkAllowlist(db).catch((error: unknown) => {
    feedback.onFailure(error, {
      source: 'provider-allowlist.sync',
      feedback: {
        surface: 'toast',
        message:
          'Provider network access could not be updated. Providers may not load until it is.',
      },
      onRetry: () => void syncProviderNetworkAllowlistReported(db),
    });
  });
}

/**
 * Remove one provider from main's table, then run `commit` (the disable or
 * uninstall). Both run in the sync queue, so no snapshot read before the commit
 * can land after the revoke and restore the provider, and the revoke's revision
 * fences any older one still on the wire. A failed revoke rejects before
 * `commit` runs: the provider stays visibly enabled until the user retries,
 * instead of looking disabled while main still allows it.
 */
export function revokeProviderNetworkAccess(
  providerId: string,
  commit: () => Promise<void>,
): Promise<void> {
  const run = queue.then(async () => {
    const result = await createAppPlatformAdapter().providerNetwork.revokeProvider(
      providerId,
      nextRevision(),
    );
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    await commit();
  });
  queue = run.catch(() => undefined);
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
