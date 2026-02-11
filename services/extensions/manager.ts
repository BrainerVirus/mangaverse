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

const getIdFromBundleUrl = (bundleUrl: string) => {
	try {
		const url = new URL(bundleUrl)
		const last = url.pathname.split("/").pop() ?? "extension"
		const normalized = last.replace(/\.js$/i, "")
		return normalized || "extension"
	} catch {
		return "extension"
	}
}

export async function installExtensionFromUrl(params: {
	bundleUrl: string
	id?: string
	name?: string
	version?: string
	icon?: string
	languages?: string[]
	nsfw?: boolean
	minAppVersion?: string
}): Promise<InstalledExtension> {
	const id = params.id?.trim() || getIdFromBundleUrl(params.bundleUrl)
	const item: ExtensionIndexItem = {
		id,
		name: params.name?.trim() || id,
		version: params.version?.trim() || "0.0.0",
		icon: params.icon?.trim() || undefined,
		languages: params.languages?.length ? params.languages : [],
		nsfw: params.nsfw ?? true,
		bundleUrl: params.bundleUrl,
		minAppVersion: params.minAppVersion?.trim() || undefined,
	}
	return installExtension(item)
}

export async function uninstallExtension(id: string) {
	await removeExtensionBundle(id)
}

export async function loadProviderFromExtension(extension: InstalledExtension): Promise<ProviderContract> {
	const provider = await loadProviderBundle(extension.localPath)
	if (!validateProviderContract(provider)) {
		throw new Error("Provider bundle failed validation")
	}
	return provider
}
