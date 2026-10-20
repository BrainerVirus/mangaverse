import type { AppDrizzleDb } from '@app/db';
import type { PlatformAdapter, PlatformCapabilities } from '@app/platform';
import type { AppResult } from '@app/shared';
import { createAppError, err } from '@app/shared';

import type { ClearStorageResult, StorageClearTarget } from './types.js';

export async function clearStorageData(input: {
  readonly db: AppDrizzleDb;
  readonly adapter: PlatformAdapter;
  readonly target: StorageClearTarget;
}): Promise<ClearStorageResult> {
  const { adapter, db, target } = input;
  const { clearSearchHistory, deleteCacheEntry, listAllCacheEntries } = await import('@app/db');

  if (target === 'provider_cache') {
    const entries = await listAllCacheEntries(db);
    let clearedCount = 0;
    let failedCount = 0;

    for (const entry of entries) {
      if (entry.blobKey !== undefined) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- delete the blob before its row so a failed delete keeps the row for a retry
        const deletion = await adapter.blobStorage.delete(entry.blobKey);
        if (!deletion.ok) {
          // Keep the row so a retry can find this blob again.
          failedCount += 1;
          continue;
        }
      }

      await deleteCacheEntry(db, entry.id);
      clearedCount += 1;
    }

    return { target, clearedCount, failedCount };
  }

  const clearedCount = await clearSearchHistory(db);
  return { target, clearedCount, failedCount: 0 };
}

export async function requestPersistentStorage(
  adapter: PlatformAdapter,
  capabilities: PlatformCapabilities,
): Promise<AppResult<boolean>> {
  if (!capabilities.storageEstimate) {
    return err(
      createAppError({
        code: 'storage.unsupported',
        message: 'Persistent storage is not available on this runtime.',
      }),
    );
  }

  return adapter.storage.persist();
}
