import * as FileSystem from "expo-file-system"

const baseDirectory = `${
	(FileSystem as { documentDirectory?: string; cacheDirectory?: string }).documentDirectory ??
		(FileSystem as { cacheDirectory?: string }).cacheDirectory ??
		""
}extensions/`

export async function ensureExtensionsDir() {
	if (!baseDirectory) {
		throw new Error("No writable directory available")
	}
	const info = await FileSystem.getInfoAsync(baseDirectory)
	if (!info.exists) {
		await FileSystem.makeDirectoryAsync(baseDirectory, { intermediates: true })
	}
	return baseDirectory
}

export async function getExtensionPath(id: string) {
	const directory = await ensureExtensionsDir()
	return `${directory}${id}.js`
}

export async function removeExtensionBundle(id: string) {
	const path = await getExtensionPath(id)
	const info = await FileSystem.getInfoAsync(path)
	if (info.exists) {
		await FileSystem.deleteAsync(path, { idempotent: true })
	}
}

export async function downloadExtensionBundle(bundleUrl: string, id: string) {
	const path = await getExtensionPath(id)
	const result = await FileSystem.downloadAsync(bundleUrl, path)
	return result.uri
}
