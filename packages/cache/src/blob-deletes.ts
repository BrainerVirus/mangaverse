import type { PlatformAdapter } from '@app/platform';

/**
 * IndexedDB serializes readwrite transactions per store, so more deletes in
 * flight than this only queue behind each other.
 */
const BLOB_DELETE_CONCURRENCY = 4;

export interface BlobDeleteOutcome {
  readonly deletedCount: number;
  /** Keys whose blob could not be deleted; the caller decides whether to keep their row. */
  readonly failedKeys: readonly string[];
}

/**
 * Deletes blob keys with bounded concurrency. A failed delete is reported, never
 * thrown: the caller decides whether a row survives (clear) or turns into an
 * orphan the next sweep retries (eviction).
 */
export async function deleteBlobKeys(
  adapter: PlatformAdapter,
  keys: readonly string[],
): Promise<BlobDeleteOutcome> {
  const failedKeys: string[] = [];
  let deletedCount = 0;

  for (let offset = 0; offset < keys.length; offset += BLOB_DELETE_CONCURRENCY) {
    const batch = keys.slice(offset, offset + BLOB_DELETE_CONCURRENCY);
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- batching IS the bound: one bounded round per chunk
    const results = await Promise.all(batch.map((key) => adapter.blobStorage.delete(key)));
    for (const [index, result] of results.entries()) {
      if (result.ok) deletedCount += 1;
      else failedKeys.push(batch[index]!);
    }
  }

  return { deletedCount, failedKeys };
}
