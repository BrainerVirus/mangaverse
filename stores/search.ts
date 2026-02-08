import { create } from "zustand"

import type { ProviderMangaItem } from "../types/provider"

type ProviderStatus = "idle" | "loading" | "success" | "error"

interface SearchState {
	resultsByProvider: Record<string, ProviderMangaItem[]>
	statusByProvider: Record<string, ProviderStatus>
	searchAll: (query: string, providerIds?: string[]) => Promise<void>
}

export const useSearchStore = create<SearchState>((set) => ({
	resultsByProvider: {},
	statusByProvider: {},
	searchAll: async (query, providerIds = []) => {
		if (query.trim().length === 0) {
			set({ resultsByProvider: {}, statusByProvider: {} })
			return
		}
		if (providerIds.length === 0) {
			set({ statusByProvider: {} })
			return
		}
		const statusUpdates: Record<string, ProviderStatus> = {}
		const results: Record<string, ProviderMangaItem[]> = {}
		providerIds.forEach((providerId) => {
			statusUpdates[providerId] = "success"
			results[providerId] = []
		})
		set((state) => ({
			statusByProvider: { ...state.statusByProvider, ...statusUpdates },
			resultsByProvider: { ...state.resultsByProvider, ...results },
		}))
	},
}))
