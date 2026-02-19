import { create } from 'zustand';

import { useExtensionsStore } from '@stores/extensions';
import type { ProviderMangaItem } from '../types/provider';

type ProviderStatus = 'idle' | 'loading' | 'success' | 'error';

interface SearchState {
	resultsByProvider: Record<string, ProviderMangaItem[]>;
	statusByProvider: Record<string, ProviderStatus>;
	searchAll: (query: string, providerIds?: string[]) => Promise<void>;
}

export const useSearchStore = create<SearchState>((set) => ({
	resultsByProvider: {},
	statusByProvider: {},
	searchAll: async (query, providerIds = []) => {
		const trimmed = query.trim();
		if (query.trim().length === 0) {
			set({ resultsByProvider: {}, statusByProvider: {} });
			return;
		}
		if (providerIds.length === 0) {
			set({ resultsByProvider: {}, statusByProvider: {} });
			return;
		}
		const providers = useExtensionsStore.getState().providers;
		const statusUpdates: Record<string, ProviderStatus> = {};
		providerIds.forEach((providerId) => {
			statusUpdates[providerId] = providers[providerId] ? 'loading' : 'error';
		});
		set((state) => ({
			statusByProvider: { ...state.statusByProvider, ...statusUpdates },
		}));
		const resultsEntries = await Promise.all(
			providerIds.map(async (providerId) => {
				const provider = providers[providerId];
				if (!provider) {
					return {
						providerId,
						payload: { status: 'error' as ProviderStatus, items: [] as ProviderMangaItem[] },
					};
				}
				try {
					const items = await provider.search(trimmed, 1);
					return {
						providerId,
						payload: { status: 'success' as ProviderStatus, items },
					};
				} catch {
					return {
						providerId,
						payload: { status: 'error' as ProviderStatus, items: [] as ProviderMangaItem[] },
					};
				}
			}),
		);
		const nextResults: Record<string, ProviderMangaItem[]> = {};
		const nextStatus: Record<string, ProviderStatus> = {};
		resultsEntries.forEach(({ providerId, payload }) => {
			nextResults[providerId] = payload.items;
			nextStatus[providerId] = payload.status;
		});
		set((state) => ({
			resultsByProvider: { ...state.resultsByProvider, ...nextResults },
			statusByProvider: { ...state.statusByProvider, ...nextStatus },
		}));
	},
}));
