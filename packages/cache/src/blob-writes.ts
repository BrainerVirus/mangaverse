/**
 * Blob keys between their store write and their cache-row upsert. An orphan
 * sweep running in that window would see a row-less blob and delete it; the
 * later row then reads as a cache hit but has no bytes. The guard is
 * process-wide and ref-counted because two callers can store the same page.
 */
const inFlightBlobWrites = new Map<string, number>();

export function isBlobWriteInFlight(key: string): boolean {
  return inFlightBlobWrites.has(key);
}

/** Runs `write` with `key` guarded from the orphan sweep until it settles. */
export async function withBlobWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
  inFlightBlobWrites.set(key, (inFlightBlobWrites.get(key) ?? 0) + 1);
  try {
    return await write();
  } finally {
    const remaining = (inFlightBlobWrites.get(key) ?? 1) - 1;
    if (remaining <= 0) inFlightBlobWrites.delete(key);
    else inFlightBlobWrites.set(key, remaining);
  }
}
