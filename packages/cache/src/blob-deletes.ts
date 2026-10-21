import type { PlatformAdapter } from '@app/platform';

import { blobLockName } from './blob-writes.js';
import { resolveLockManager } from './web-locks.js';

/**
 * IndexedDB serializes readwrite transactions per store, so more deletes in
 * flight than this only queue behind each other.
 */
const BLOB_DELETE_CONCURRENCY = 4;

export interface BlobDeleteOutcome {
  readonly deletedKeys: readonly string[];
  /** Keys whose blob could not be deleted; the caller decides whether to keep their row. */
  readonly failedKeys: readonly string[];
}

export interface BlobDeleteOptions {
  /**
   * Re-checked inside the key's exclusive lock: true leaves the blob alone
   * because a row (or a write about to land one) references it. Because the
   * lock waits for in-flight writers first, a row seen here was re-created by a
   * writer that finished after the caller enumerated candidates.
   */
  readonly skip?: (key: string) => boolean | Promise<boolean>;
  /**
   * Delete without a lock when Web Locks is missing. Off by default so
   * eviction and reclaim fail closed; an explicit cache clear opts in.
   */
  readonly allowUnlocked?: boolean;
}

type BlobDeleteResult = 'deleted' | 'failed' | 'skipped';

/**
 * Deletes blob keys with bounded concurrency. A failed delete is reported, never
 * thrown: the caller decides whether a row survives (clear) or turns into an
 * orphan the next sweep retries (eviction).
 *
 * Each delete holds `mangaverse:blob:<key>` exclusively across its `skip` check
 * and the delete itself, while writes hold the same name shared from before
 * their put through their row upsert. A write can therefore never start between
 * the check and the delete, and a check can never run while bytes are landing.
 * Locks are requested one key at a time and never nested, so there is no
 * deadlock and at most one lock per in-flight delete.
 */
export async function deleteBlobKeys(
  adapter: PlatformAdapter,
  keys: readonly string[],
  options: BlobDeleteOptions = {},
): Promise<BlobDeleteOutcome> {
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];
  const locks = resolveLockManager();

  const deleteNow = async (key: string): Promise<BlobDeleteResult> => {
    if ((await options.skip?.(key)) === true) return 'skipped';
    const result = await adapter.blobStorage.delete(key);
    return result.ok ? 'deleted' : 'failed';
  };

  const deleteOne = async (key: string): Promise<BlobDeleteResult> => {
    if (locks === undefined) {
      return options.allowUnlocked === true ? deleteNow(key) : 'failed';
    }
    try {
      return await locks.request(blobLockName(key), { mode: 'exclusive' }, () => deleteNow(key));
    } catch {
      // A lock that cannot be taken must not become a delete.
      return 'failed';
    }
  };

  for (let offset = 0; offset < keys.length; offset += BLOB_DELETE_CONCURRENCY) {
    const batch = keys.slice(offset, offset + BLOB_DELETE_CONCURRENCY);
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- batching IS the bound: one bounded round per chunk
    // oxlint-disable-next-line eslint/no-await-in-loop
    const results = await Promise.all(batch.map(deleteOne));
    for (const [index, result] of results.entries()) {
      if (result === 'deleted') deletedKeys.push(batch[index]!);
      else if (result === 'failed') failedKeys.push(batch[index]!);
    }
  }

  return { deletedKeys, failedKeys };
}
