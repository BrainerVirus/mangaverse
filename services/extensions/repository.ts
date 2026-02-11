import type { ExtensionIndexItem } from "../../types/provider"

import { DEFAULT_EXTENSION_REPO } from "@lib/constants"

const cache = new Map<string, { expiresAt: number; data: ExtensionIndexItem[] }>()
const cacheTtlMs = 60_000

export async function fetchExtensionIndex(repoUrl?: string) {
	const resolved = repoUrl || DEFAULT_EXTENSION_REPO
	if (!resolved) {
		return [] as ExtensionIndexItem[]
	}
	const cached = cache.get(resolved)
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data
	}
	const response = await fetch(resolved)
	if (!response.ok) {
		throw new Error("Failed to fetch extension index")
	}
	const data = (await response.json()) as ExtensionIndexItem[]
	cache.set(resolved, { data, expiresAt: Date.now() + cacheTtlMs })
	return data
}
