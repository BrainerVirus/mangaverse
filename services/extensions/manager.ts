import AsyncStorage from "@react-native-async-storage/async-storage"

import type { InstalledExtension } from "../../types/extension"
import type { ExtensionIndexItem, ProviderContract } from "../../types/provider"

import { loadProviderBundle, validateProviderContract } from "./runtime"
import { downloadExtensionBundle, removeExtensionBundle } from "./storage"

const storageKey = "extensions.installed"

export async function loadInstalledExtensions(): Promise<InstalledExtension[]> {
	const raw = await AsyncStorage.getItem(storageKey)
	if (!raw) {
		return []
	}
	try {
		return JSON.parse(raw) as InstalledExtension[]
	} catch {
		return []
	}
}

export async function saveInstalledExtensions(extensions: InstalledExtension[]) {
	await AsyncStorage.setItem(storageKey, JSON.stringify(extensions))
}

export function toInstalledExtension(item: ExtensionIndexItem, bundlePath: string): InstalledExtension {
	return {
		id: item.id,
		name: item.name,
		version: item.version,
		icon: item.icon,
		languages: item.languages,
		nsfw: item.nsfw,
		bundleUrl: item.bundleUrl,
		minAppVersion: item.minAppVersion,
		localPath: bundlePath,
		enabled: true,
		order: 0,
		installedAt: Date.now(),
		enabledLanguages: item.languages,
	}
}

export async function installExtension(item: ExtensionIndexItem): Promise<InstalledExtension> {
	const bundlePath = await downloadExtensionBundle(item.bundleUrl, item.id)
	return toInstalledExtension(item, bundlePath)
}

export async function uninstallExtension(id: string) {
	await removeExtensionBundle(id)
}

export async function loadProviderFromExtension(extension: InstalledExtension): Promise<ProviderContract | null> {
	try {
		const provider = await loadProviderBundle(extension.localPath)
		if (!validateProviderContract(provider)) {
			return null
		}
		return provider
	} catch {
		return null
	}
}
