import { deleteFile, downloadFile, ensureDir, fileExists } from '@services/platform/filesystem';

const baseDirectory = 'extensions/';

export async function ensureExtensionsDir() {
	return ensureDir(baseDirectory);
}

export async function getExtensionPath(id: string) {
	await ensureExtensionsDir();
	return `${baseDirectory}${id}.js`;
}

export async function removeExtensionBundle(id: string) {
	const path = await getExtensionPath(id);
	const exists = await fileExists(path);
	if (exists) {
		await deleteFile(path);
	}
}

export async function downloadExtensionBundle(bundleUrl: string, id: string) {
	const path = await getExtensionPath(id);
	return downloadFile(bundleUrl, path);
}
