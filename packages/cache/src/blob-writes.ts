import { resolveLockManager } from './web-locks.js';

const BLOB_LOCK_PREFIX = 'mangaverse:blob:';

/**
 * One lock name per blob key. Writers hold it shared from before the blob put
 * through the row upsert; deletes hold it exclusively across their in-flight
 * check and the delete, so neither can slip between the other's check and
 * action. The browser owns the lock, so a crashed tab cannot leave it held and
 * the name lives no longer than the operation.
 */
export function blobLockName(key: string): string {
  return `${BLOB_LOCK_PREFIX}${key}`;
}

/**
 * Blob keys between their store write and their cache-row upsert. A sweep
 * running in that window would see a row-less blob and delete it; the later row
 * then reads as a cache hit but has no bytes. The map is process-wide and
 * ref-counted because two callers can store the same page; the per-key Web Lock
 * is what covers other tabs.
 */
const inFlightBlobWrites = new Map<string, number>();

export function isBlobWriteInFlight(key: string): boolean {
  return inFlightBlobWrites.has(key);
}

/**
 * Runs `write` with `key` guarded from the orphan sweep until it settles.
 * Without Web Locks the write still runs: a cache write must not depend on a
 * lock manager, and only the delete path fails closed. A lock request that
 * rejects before invoking its callback gets the same treatment; one that ran
 * the write and then rejected keeps the write's error.
 */
export async function withBlobWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
  inFlightBlobWrites.set(key, (inFlightBlobWrites.get(key) ?? 0) + 1);
  try {
    const locks = resolveLockManager();
    if (locks === undefined) return await write();

    const state = { started: false };
    try {
      return await locks.request(blobLockName(key), { mode: 'shared' }, async () => {
        state.started = true;
        return write();
      });
    } catch (error) {
      if (state.started) throw error;
      return await write();
    }
  } finally {
    const remaining = (inFlightBlobWrites.get(key) ?? 1) - 1;
    if (remaining <= 0) inFlightBlobWrites.delete(key);
    else inFlightBlobWrites.set(key, remaining);
  }
}
