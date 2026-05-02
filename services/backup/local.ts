import { PlatformInfo } from '@lib/platform';
import { readFile, writeFile } from '@services/platform/filesystem';
import { pickAndReadFile, saveAndWriteFile } from '@services/platform/filesystem.web';

const backupFileName = 'mangaverse-backup.json';

export async function exportBackup(payload: unknown): Promise<string> {
	if (PlatformInfo.isWeb) {
		const json = JSON.stringify(payload, null, 2);
		await saveAndWriteFile(json, backupFileName);
		return backupFileName;
	}

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const FileSystem = require('expo-file-system');
	const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
	if (!directory) {
		throw new Error('No writable directory available');
	}
	const uri = `${directory}${backupFileName}`;
	await writeFile(uri, JSON.stringify(payload, null, 2));
	return uri;
}

export async function importBackup(uriOrContent: string): Promise<unknown> {
	if (PlatformInfo.isWeb) {
		if (uriOrContent.startsWith('{') || uriOrContent.startsWith('[')) {
			return JSON.parse(uriOrContent) as unknown;
		}
		const result = await pickAndReadFile();
		if (!result) {
			throw new Error('No file selected');
		}
		return JSON.parse(result.content) as unknown;
	}

	if (uriOrContent.startsWith('{') || uriOrContent.startsWith('[')) {
		return JSON.parse(uriOrContent) as unknown;
	}

	const content = await readFile(uriOrContent);
	return JSON.parse(content) as unknown;
}
