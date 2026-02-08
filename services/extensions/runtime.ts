import type { ProviderContract } from "../../types/provider"

export function validateProviderContract(provider: ProviderContract) {
	if (!provider?.meta?.id || !provider.meta?.name) {
		return false
	}
	const requiredFns: (keyof ProviderContract)[] = [
		"getDiscoverSections",
		"getDiscoverSectionItems",
		"search",
		"getAvailableFilters",
		"getMangaDetails",
		"getChapterList",
		"getChapterPages",
	]
	return requiredFns.every((fn) => typeof provider[fn] === "function")
}

export async function loadProviderBundle(bundlePathOrUrl: string) {
	let code = ""
	if (bundlePathOrUrl.startsWith("http")) {
		const response = await fetch(bundlePathOrUrl)
		if (!response.ok) {
			throw new Error("Failed to download provider bundle")
		}
		code = await response.text()
	} else {
		const FileSystem = await import("expo-file-system")
		code = await FileSystem.readAsStringAsync(bundlePathOrUrl)
	}
	const module = { exports: {} as unknown }
	const factory = new Function("module", "exports", code)
	factory(module, (module as { exports: unknown }).exports)
	return (module as { exports: ProviderContract }).exports
}
