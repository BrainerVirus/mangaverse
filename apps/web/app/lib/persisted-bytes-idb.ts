import type { PersistedBytesStore, PersistedSnapshot } from '@app/db/browser';

const DB_NAME = 'mangaverse-local-db';
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'main';
const DB_VERSION = 1;

interface StoredSnapshot {
  readonly bytes: Uint8Array;
  readonly version: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open local database store.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * IndexedDB-backed snapshot store for the browser SQLite database.
 *
 * Separate database from the cover/page blob cache so clearing caches can never
 * erase library, progress or settings. The compare-and-swap check runs inside
 * one readwrite transaction so concurrent tabs cannot interleave a lost update.
 */
export function createIndexedDbPersistedBytesStore(): PersistedBytesStore {
  return {
    read: async (): Promise<PersistedSnapshot | undefined> => {
      const db = await openDatabase();
      try {
        return await new Promise<PersistedSnapshot | undefined>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const request = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
          request.onerror = () => reject(request.error ?? new Error('Failed to read snapshot.'));
          request.onsuccess = () => {
            const stored = request.result as StoredSnapshot | undefined;
            resolve(
              stored === undefined ? undefined : { bytes: stored.bytes, version: stored.version },
            );
          };
        });
      } finally {
        db.close();
      }
    },
    write: async (
      bytes: Uint8Array,
      expectedVersion: number,
    ): Promise<PersistedSnapshot | null> => {
      const db = await openDatabase();
      try {
        return await new Promise<PersistedSnapshot | null>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(SNAPSHOT_KEY);
          request.onerror = () => reject(request.error ?? new Error('Failed to read snapshot.'));
          request.onsuccess = () => {
            const stored = request.result as StoredSnapshot | undefined;
            const currentVersion = stored?.version ?? 0;
            if (currentVersion !== expectedVersion) {
              resolve(null);
              return;
            }
            const next: StoredSnapshot = { bytes, version: currentVersion + 1 };
            const put = store.put(next, SNAPSHOT_KEY);
            put.onerror = () => reject(put.error ?? new Error('Failed to store snapshot.'));
            tx.oncomplete = () => resolve({ bytes, version: next.version });
            tx.onerror = () => reject(tx.error ?? new Error('Snapshot transaction failed.'));
          };
        });
      } finally {
        db.close();
      }
    },
    clear: async (): Promise<void> => {
      const db = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const request = tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
          request.onerror = () => reject(request.error ?? new Error('Failed to clear snapshot.'));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('Snapshot delete transaction failed.'));
        });
      } finally {
        db.close();
      }
    },
  };
}
