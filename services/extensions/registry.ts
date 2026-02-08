import type { ExtensionIndexItem, ProviderContract } from "../../types/provider"

interface InstalledExtension {
	meta: ExtensionIndexItem
	provider?: ProviderContract
}

const registry = new Map<string, InstalledExtension>()

export function getInstalledExtensions() {
	return Array.from(registry.values())
}

export function registerExtension(meta: ExtensionIndexItem, provider?: ProviderContract) {
	registry.set(meta.id, { meta, provider })
}

export function removeExtension(id: string) {
	registry.delete(id)
}
