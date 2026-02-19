import * as FileSystem from 'expo-file-system';

const backupFileName = 'mangaverse-backup.json';

export async function exportBackup(payload: unknown) {
	// eslint-disable-next-line import/namespace -- expo-file-system re-exports these at runtime
	const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
	if (!directory) {
		throw new Error('No writable directory available');
	}
	const uri = `${directory}${backupFileName}`;
	await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
	return uri;
}

export async function importBackup(uri: string) {
	const content = await FileSystem.readAsStringAsync(uri);
	return JSON.parse(content) as unknown;
}
