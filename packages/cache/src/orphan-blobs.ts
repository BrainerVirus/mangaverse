import type { AppDrizzleDb } from '@app/db';
import { listCacheBlobKeys } from '@app/db';
import type { PlatformAdapter } from '@app/platform';

import { deleteBlobKeys } from './blob-deletes.js';
import { isCacheBlobKey } from './constants.js';

/** One sweep reclaims at most this many orphan blobs; the rest wait for the next run. */
const ORPHAN_DELETE_LIMIT = 200;

export interface OrphanBlobReclaimResult {
  readonly reclaimedBlobs: number;
  readonly failedBlobKeys: readonly string[];
}

/**
 * Reclaims cache blobs whose row is gone: a failed delete during eviction
 * (`retryKeys`), or a write that never reached its row. Row accounting cannot
 * see those bytes, so only enumerating the blob store can.
 *
 * Cross-store limit: rows live in SQLite and blobs in IndexedDB, so this is not
 * atomic with a writer in another tab (or this one). A blob put just before its
 * row upsert can be seen as an orphan and deleted; every read then treats the
 * surviving row as a cache miss and refetches, so the cost is a refetch, not a
 * broken page. No full scan of either store is repeated per key: one key
 * enumeration, one row-key read, one bounded delete pass.
 */
export async function reclaimOrphanBlobs(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  retryKeys: readonly string[] = [],
): Promise<OrphanBlobReclaimResult> {
  const knownKeys = new Set(await listCacheBlobKeys(db));
  const listed = await adapter.blobStorage.listKeys();
  if (!listed.ok) {
    // No enumerable blob store on this runtime: nothing can be reclaimed here.
    return { reclaimedBlobs: 0, failedBlobKeys: [] };
  }

  const candidates = new Set(retryKeys);
  for (const key of listed.value) {
    if (!knownKeys.has(key)) {
      candidates.add(key);
    }
  }
  const orphanKeys = [...candidates]
    .filter((key) => isCacheBlobKey(key) && !knownKeys.has(key))
    .slice(0, ORPHAN_DELETE_LIMIT);
  if (orphanKeys.length === 0) {
    return { reclaimedBlobs: 0, failedBlobKeys: [] };
  }

  const outcome = await deleteBlobKeys(adapter, orphanKeys);
  return { reclaimedBlobs: outcome.deletedCount, failedBlobKeys: outcome.failedKeys };
}
