import { create } from 'zustand';

import type { LibraryManga } from '../types/library';

interface LibraryState {
	manga: LibraryManga[];
	addManga: (item: LibraryManga) => void;
	seedLibrary: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
	manga: [],
	addManga: (item) =>
		set((state) => ({
			manga: state.manga.some((entry) => entry.id === item.id) ? state.manga : [item, ...state.manga],
		})),
	seedLibrary: () =>
		set((state) => {
			if (state.manga.length > 0) {
				return state;
			}
			return {
				...state,
				manga: [
					{
						id: 'manga-1',
						title: 'Violet Crescent',
						coverUrl: '',
						unreadCount: 12,
					},
					{
						id: 'manga-2',
						title: 'Skybound Atlas',
						coverUrl: '',
						unreadCount: 4,
					},
					{
						id: 'manga-3',
						title: 'Ashen Bloom',
						coverUrl: '',
						unreadCount: 21,
					},
					{
						id: 'manga-4',
						title: 'Signal in the Dunes',
						coverUrl: '',
						unreadCount: 0,
					},
				],
			};
		}),
}));
