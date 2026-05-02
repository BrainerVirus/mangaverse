import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { getItem, removeItem, setItem } from '@services/platform/storage';

interface PreferencesState {
	privateMode: boolean;
	setPrivateMode: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
	persist(
		(set) => ({
			privateMode: false,
			setPrivateMode: (enabled) => set({ privateMode: enabled }),
		}),
		{
			name: 'mangaverse-preferences',
			storage: {
				getItem: async (name) => {
					const value = await getItem(name);
					return value ? JSON.parse(value) : null;
				},
				setItem: async (name, value) => {
					await setItem(name, JSON.stringify(value));
				},
				removeItem: async (name) => {
					await removeItem(name);
				},
			},
		},
	),
);
