import type { ExtensionIndexItem } from "../../types/provider"

const cache = new Map<string, { expiresAt: number; data: ExtensionIndexItem[] }>()
const cacheTtlMs = 60_000

export async function fetchExtensionIndex(repoUrl: string) {
	if (!repoUrl) {
		return [] as ExtensionIndexItem[]
	}
	const cached = cache.get(repoUrl)
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data
	}
	const response = await fetch(repoUrl)
	if (!response.ok) {
		throw new Error("Failed to fetch extension index")
	}
	const data = (await response.json()) as ExtensionIndexItem[]
	cache.set(repoUrl, { data, expiresAt: Date.now() + cacheTtlMs })
	return data
}
