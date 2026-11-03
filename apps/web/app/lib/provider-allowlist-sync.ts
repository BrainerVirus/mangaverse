import type { AppDrizzleDb } from '@app/db';
import { listInstalledExtensions } from '@app/db/browser';
import type { ProviderNetworkRegistration } from '@app/platform';

import { createAppPlatformAdapter } from '../features/diagnostics/create-app-platform-adapter.js';
import { feedback } from './app-feedback.js';

/**
 * Serializes allowlist syncs. The transport assigns each revision (main on
 * desktop, the page clock on web), so a renderer reload or a backward wall clock
 * cannot reuse a revision already fenced by a revoke.
 */
let queue: Promise<void> = Promise.resolve();

async function nextRevision(): Promise<number> {
  const result = await createAppPlatformAdapter().providerNetwork.nextRevision();
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

/**
 * Mirror the installed, enabled providers' declared domains into main as a full
 * snapshot. Main replaces its table with exactly this set, so a provider that was
 * disabled or uninstalled is removed even though this renderer remembers nothing
 * across a reload. Runs at startup and after every install, import, update, enable,
 * disable and uninstall. On the web the adapter replaces the page-held table the
 * browser transport enforces, so the same snapshot gates its requests. A failure
 * rejects: the transport keeps its previous table, so the caller must report it,
 * and the next sync (or the user's retry) sends the snapshot again.
 */
export function syncProviderNetworkAllowlist(db: AppDrizzleDb): Promise<void> {
  // Stamp inside the queue, and ask the transport: a snapshot queued behind a
  // revoke must carry a newer revision, or it fences the snapshot and the provider
  // stays blocked while the action reports success.
  const run = queue.then(async () => syncInstalledProviders(db, await nextRevision()));
  // A failed sync must not wedge the ones queued after it.
  queue = run.catch(() => undefined);
  return run;
}

/**
 * For an action that already succeeded (install, import, startup): run the sync
 * and, if it fails, tell the user with a retry instead of dropping the failure.
 * The transport keeps its previous table, so the new provider stays unreachable
 * until then.
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
 * Remove one provider from the transport's table, then run `commit` (the disable
 * or uninstall). Both run in the sync queue, so no snapshot read before the
 * commit can land after the revoke and restore the provider, and the revoke's
 * revision fences any older one still on the wire. A failed revoke rejects before
 * `commit` runs: the provider stays visibly enabled until the user retries,
 * instead of looking disabled while the transport still allows it.
 */
export function revokeProviderNetworkAccess(
  providerId: string,
  commit: () => Promise<void>,
): Promise<void> {
  const run = queue.then(async () => {
    const revision = await nextRevision();
    const result = await createAppPlatformAdapter().providerNetwork.revokeProvider(
      providerId,
      revision,
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
