export interface StorageAdapter {
	getItem(key: string): Promise<string | null>;
	setItem(key: string, value: string): Promise<void>;
	removeItem(key: string): Promise<void>;
}

export interface FileInfo {
	exists: boolean;
	uri: string;
}

export interface FileSystemAdapter {
	readFile(path: string): Promise<string>;
	writeFile(path: string, contents: string): Promise<void>;
	deleteFile(path: string): Promise<void>;
	fileExists(path: string): Promise<boolean>;
	downloadFile(url: string, path: string): Promise<string>;
	ensureDir(path: string): Promise<string>;
	getDocumentDir(): string;
}

export interface SecureStoreAdapter {
	getItemAsync(key: string): Promise<string | null>;
	setItemAsync(key: string, value: string): Promise<void>;
	deleteItemAsync(key: string): Promise<void>;
}

export interface DatabaseAdapter {
	exec(sql: string): Promise<void>;
	getAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
	run(sql: string, params?: unknown[]): Promise<void>;
	close(): Promise<void>;
}

export interface PlatformDatabase {
	openDatabase(name: string): Promise<DatabaseAdapter>;
}
