import type { PlatformAdapter } from '@app/platform';

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

/**
 * Deletes blob keys with bounded concurrency. A failed delete is reported, never
 * thrown: the caller decides whether a row survives (clear) or turns into an
 * orphan the next sweep retries (eviction). `skip` is checked immediately before
 * each delete starts, so a key that became in flight since enumeration is left
 * alone.
 */
export async function deleteBlobKeys(
  adapter: PlatformAdapter,
  keys: readonly string[],
  skip?: (key: string) => boolean,
): Promise<BlobDeleteOutcome> {
  const deletedKeys: string[] = [];
  const failedKeys: string[] = [];

  for (let offset = 0; offset < keys.length; offset += BLOB_DELETE_CONCURRENCY) {
    const batch = keys.slice(offset, offset + BLOB_DELETE_CONCURRENCY);
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- batching IS the bound: one bounded round per chunk
    // oxlint-disable-next-line eslint/no-await-in-loop
    const results = await Promise.all(
      batch.map(async (key) => {
        if (skip?.(key) === true) return 'skipped' as const;
        const result = await adapter.blobStorage.delete(key);
        return result.ok ? ('deleted' as const) : ('failed' as const);
      }),
    );
    for (const [index, result] of results.entries()) {
      if (result === 'deleted') deletedKeys.push(batch[index]!);
      else if (result === 'failed') failedKeys.push(batch[index]!);
    }
  }

  return { deletedKeys, failedKeys };
}
