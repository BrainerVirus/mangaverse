import type { ExtensionIndexItem } from "../../types/provider"

export async function fetchExtensionIndex(repoUrl: string) {
	if (!repoUrl) {
		return [] as ExtensionIndexItem[]
	}
	const response = await fetch(repoUrl)
	if (!response.ok) {
		throw new Error("Failed to fetch extension index")
	}
	const data = (await response.json()) as ExtensionIndexItem[]
	return data
}
