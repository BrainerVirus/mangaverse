import { deleteBlobKeys, reclaimOrphanBlobs } from '@app/cache';
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

  if (target === 'provider_cache') {
    const { deleteCacheEntries, listAllCacheEntries } = await import('@app/db');
    const entries = await listAllCacheEntries(db);

    // Blobs first, then rows: a failed blob delete keeps its row so a retry can
    // find this blob again. Deletes are batched (blobs bounded-concurrent, rows in
    // one statement) because one round trip per entry made clearing a big cache
    // crawl. Cross-store limit: rows (SQLite) and blobs (IndexedDB) cannot be
    // deleted atomically. A write another tab makes during the clear survives it;
    // if the batched row delete fails after blobs went, the clear throws and the
    // kept rows read as cache misses until the next clear removes them.
    const blobKeys = entries.flatMap((entry) =>
      entry.blobKey === undefined ? [] : [entry.blobKey],
    );
    const blobs = await deleteBlobKeys(adapter, blobKeys);
    const failedKeys = new Set(blobs.failedKeys);
    const clearedIds = entries
      .filter((entry) => entry.blobKey === undefined || !failedKeys.has(entry.blobKey))
      .map((entry) => entry.id);
    await deleteCacheEntries(db, clearedIds);

    // Reclaim blobs an earlier eviction detached from its row; row accounting
    // cannot see them, so clearing cache is the last place that can free them.
    const orphans = await reclaimOrphanBlobs(db, adapter);

    return {
      target,
      clearedCount: clearedIds.length,
      failedCount: entries.length - clearedIds.length,
      reclaimedBlobs: orphans.reclaimedBlobs,
    };
  }

  const { clearSearchHistory } = await import('@app/db');
  const clearedCount = await clearSearchHistory(db);
  return { target, clearedCount, failedCount: 0, reclaimedBlobs: 0 };
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
