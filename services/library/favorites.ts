import { create } from "zustand"

import type { ProviderMangaItem } from "../../types/provider"

interface FavoriteEntry extends ProviderMangaItem {
	providerId: string
}

interface FavoritesState {
	items: FavoriteEntry[]
	add: (item: ProviderMangaItem, providerId: string) => void
	remove: (id: string, providerId: string) => void
	contains: (id: string, providerId: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
	items: [],
	add: (item, providerId) =>
		set((state) => {
			if (state.items.some((entry) => entry.id === item.id && entry.providerId === providerId)) {
				return state
			}
			return { items: [{ ...item, providerId }, ...state.items] }
		}),
	remove: (id, providerId) =>
		set((state) => ({
			items: state.items.filter((entry) => !(entry.id === id && entry.providerId === providerId)),
		})),
	contains: (id, providerId) =>
		get().items.some((entry) => entry.id === id && entry.providerId === providerId),
}))
