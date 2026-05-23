function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('mangaverse-storage', 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore('kv', { keyPath: 'k' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function getDB(): Promise<IDBDatabase> {
	if (!_dbPromise) {
		_dbPromise = openDB();
	}
	return _dbPromise;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
	return getDB().then((db) => db.transaction('kv', mode).objectStore('kv'));
}

export async function getItem(key: string): Promise<string | null> {
	const store = await getStore('readonly');
	return new Promise((resolve, reject) => {
		const request = store.get(key);
		request.onsuccess = () => {
			const result = request.result;
			if (result === undefined) {
				resolve(null);
			} else {
				resolve(typeof result.v === 'string' ? result.v : null);
			}
		};
		request.onerror = () => reject(request.error);
	});
}

export async function setItem(key: string, value: string): Promise<void> {
	const store = await getStore('readwrite');
	return new Promise((resolve, reject) => {
		const request = store.put({ k: key, v: value });
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

export async function removeItem(key: string): Promise<void> {
	const store = await getStore('readwrite');
	return new Promise((resolve, reject) => {
		const request = store.delete(key);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

export async function getAllKeys(): Promise<string[]> {
	const store = await getStore('readonly');
	return new Promise((resolve, reject) => {
		const request = store.getAllKeys();
		request.onsuccess = () => resolve(request.result as string[]);
		request.onerror = () => reject(request.error);
	});
}
