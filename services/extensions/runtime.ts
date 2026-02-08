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

export async function loadProviderBundle(bundleUrl: string) {
	const response = await fetch(bundleUrl)
	if (!response.ok) {
		throw new Error("Failed to download provider bundle")
	}
	const code = await response.text()
	const module = { exports: {} as unknown }
	const factory = new Function("module", "exports", code)
	factory(module, (module as { exports: unknown }).exports)
	return (module as { exports: ProviderContract }).exports
}
