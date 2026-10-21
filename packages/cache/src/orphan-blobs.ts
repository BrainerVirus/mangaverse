import type { AppDrizzleDb } from '@app/db';
import { listCacheBlobKeys } from '@app/db';
import type { PlatformAdapter } from '@app/platform';

import { deleteBlobKeys } from './blob-deletes.js';
import { isBlobWriteInFlight } from './blob-writes.js';
import type { CacheChapterRef } from './cache-maintenance.js';
import { isCacheBlobKey, PAGE_CACHE_KIND } from './constants.js';
import { probeReaderPresence } from './reader-locks.js';

/** One sweep reclaims at most this many orphan blobs; the rest wait for the next run. */
const ORPHAN_DELETE_LIMIT = 200;

export interface OrphanBlobReclaimResult {
  readonly reclaimedKeys: readonly string[];
  readonly failedBlobKeys: readonly string[];
}

/**
 * Reclaims cache blobs whose row is gone: a failed delete during eviction
 * (`retryKeys`), or a write that never reached its row. Row accounting cannot
 * see those bytes, so only enumerating the blob store can.
 *
 * Cross-store limit: rows live in SQLite and blobs in IndexedDB, so this is not
 * atomic with a writer in another tab. A reader can have a blob put before its
 * row upsert, so blobs belonging to a chapter another tab holds a reader lock
 * for are skipped; readers in this process are additionally covered by the
 * in-flight guard. No full scan of either store is repeated per key: one key
 * enumeration, one row-key read, one bounded delete pass.
 */
export async function reclaimOrphanBlobs(
  db: AppDrizzleDb,
  adapter: PlatformAdapter,
  retryKeys: readonly string[] = [],
): Promise<OrphanBlobReclaimResult> {
  const presence = await probeReaderPresence();
  // Without a presence answer we cannot tell an in-flight write from an orphan.
  if (presence.status === 'unknown') {
    return { reclaimedKeys: [], failedBlobKeys: [] };
  }
  const openChapters = presence.status === 'readers' ? presence.chapters : [];

  try {
    const knownKeys = new Set(await listCacheBlobKeys(db));
    const listed = await adapter.blobStorage.listKeys();
    if (!listed.ok) {
      // No enumerable blob store on this runtime: nothing can be reclaimed here.
      return { reclaimedKeys: [], failedBlobKeys: [] };
    }

    const candidates = new Set(retryKeys);
    for (const key of listed.value) {
      if (!knownKeys.has(key)) {
        candidates.add(key);
      }
    }
    const orphanKeys = [...candidates]
      .filter(
        (key) =>
          isCacheBlobKey(key) && !knownKeys.has(key) && !isOpenChapterBlob(key, openChapters),
      )
      .slice(0, ORPHAN_DELETE_LIMIT);
    if (orphanKeys.length === 0) {
      return { reclaimedKeys: [], failedBlobKeys: [] };
    }

    const outcome = await deleteBlobKeys(adapter, orphanKeys, isBlobWriteInFlight);
    return { reclaimedKeys: outcome.deletedKeys, failedBlobKeys: outcome.failedKeys };
  } finally {
    if (presence.status === 'none') presence.release();
  }
}

function isOpenChapterBlob(key: string, chapters: readonly CacheChapterRef[]): boolean {
  return chapters.some((chapter) =>
    key.startsWith(
      `${PAGE_CACHE_KIND}:${chapter.providerId}:${chapter.mangaId}:${chapter.chapterId}:`,
    ),
  );
}
