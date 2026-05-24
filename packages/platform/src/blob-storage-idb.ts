const DB_NAME = 'mangaverse-blobs';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

export interface StoredBlobRecord {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
}

interface BlobStoreEnvironment {
  readonly indexedDB?: IDBFactory;
}

function resolveEnv(environment?: BlobStoreEnvironment): BlobStoreEnvironment {
  if (environment?.indexedDB !== undefined) {
    return environment;
  }
  if (typeof globalThis.indexedDB !== 'undefined') {
    return { indexedDB: globalThis.indexedDB };
  }
  return {};
}

function openBlobDatabase(environment?: BlobStoreEnvironment): Promise<IDBDatabase> {
  const env = resolveEnv(environment);
  const indexedDB = env.indexedDB;
  if (!indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open blob database.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function putIndexedDbBlob(
  key: string,
  data: ArrayBuffer,
  mimeType: string,
  environment?: BlobStoreEnvironment,
): Promise<void> {
  const db = await openBlobDatabase(environment);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ data, mimeType }, key);
      request.onerror = () => reject(request.error ?? new Error('Failed to store blob.'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Blob transaction failed.'));
    });
  } finally {
    db.close();
  }
}

export async function getIndexedDbBlob(
  key: string,
  environment?: BlobStoreEnvironment,
): Promise<StoredBlobRecord | undefined> {
  const db = await openBlobDatabase(environment);
  try {
    const record = await new Promise<StoredBlobRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error ?? new Error('Failed to read blob.'));
      request.onsuccess = () => {
        const value = request.result as StoredBlobRecord | undefined;
        resolve(value);
      };
    });
    return record;
  } finally {
    db.close();
  }
}

export async function deleteIndexedDbBlob(
  key: string,
  environment?: BlobStoreEnvironment,
): Promise<void> {
  const db = await openBlobDatabase(environment);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onerror = () => reject(request.error ?? new Error('Failed to delete blob.'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Blob delete transaction failed.'));
    });
  } finally {
    db.close();
  }
}

export async function clearIndexedDbBlobs(environment?: BlobStoreEnvironment): Promise<void> {
  const db = await openBlobDatabase(environment);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error ?? new Error('Failed to clear blobs.'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Blob clear transaction failed.'));
    });
  } finally {
    db.close();
  }
}
