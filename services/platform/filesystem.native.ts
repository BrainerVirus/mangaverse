import * as FileSystem from 'expo-file-system';

export function getDocumentDir(): string {
	const fs = FileSystem as { documentDirectory?: string; cacheDirectory?: string };
	return fs.documentDirectory ?? fs.cacheDirectory ?? '';
}

export async function readFile(path: string): Promise<string> {
	return FileSystem.readAsStringAsync(path);
}

export async function writeFile(path: string, contents: string): Promise<void> {
	await FileSystem.writeAsStringAsync(path, contents, { encoding: 'utf8' });
}

export async function deleteFile(path: string): Promise<void> {
	const info = await FileSystem.getInfoAsync(path);
	if (info.exists) {
		await FileSystem.deleteAsync(path, { idempotent: true });
	}
}

export async function fileExists(path: string): Promise<boolean> {
	const info = await FileSystem.getInfoAsync(path);
	return info.exists;
}

export async function downloadFile(url: string, path: string): Promise<string> {
	const result = await FileSystem.downloadAsync(url, path);
	return result.uri;
}

export async function ensureDir(path: string): Promise<string> {
	const info = await FileSystem.getInfoAsync(path);
	if (!info.exists) {
		await FileSystem.makeDirectoryAsync(path, { intermediates: true });
	}
	return path;
}
