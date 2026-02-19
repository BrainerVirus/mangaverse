import { create } from 'zustand';

import { usePreferencesStore } from '@stores/preferences';
import type { HistoryEntry } from '../types/library';

interface HistoryState {
	entries: HistoryEntry[];
	addEntry: (entry: HistoryEntry) => void;
	clear: () => void;
	seedHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
	entries: [],
	addEntry: (entry) => {
		if (usePreferencesStore.getState().privateMode) {
			return;
		}
		set((state) => ({ entries: [entry, ...state.entries] }));
	},
	clear: () => set({ entries: [] }),
	seedHistory: () =>
		set((state) => {
			if (state.entries.length > 0) {
				return state;
			}
			return {
				...state,
				entries: [
					{
						id: 'history-1',
						title: 'Violet Crescent',
						chapter: '32',
						page: 11,
						readAt: Date.now() - 1000 * 60 * 20,
						readAtLabel: 'Today · 20 min ago',
					},
					{
						id: 'history-2',
						title: 'Ashen Bloom',
						chapter: '18',
						page: 3,
						readAt: Date.now() - 1000 * 60 * 60 * 6,
						readAtLabel: 'Today · 6h ago',
					},
					{
						id: 'history-3',
						title: 'Skybound Atlas',
						chapter: '7',
						page: 19,
						readAt: Date.now() - 1000 * 60 * 60 * 26,
						readAtLabel: 'Yesterday',
					},
				],
			};
		}),
}));
