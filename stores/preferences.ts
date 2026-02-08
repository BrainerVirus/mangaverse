import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface PreferencesState {
	privateMode: boolean
	setPrivateMode: (enabled: boolean) => void
}

export const usePreferencesStore = create<PreferencesState>()(
	persist(
		(set) => ({
			privateMode: false,
			setPrivateMode: (enabled) => set({ privateMode: enabled }),
		}),
		{
			name: "mangaverse-preferences",
			storage: {
				getItem: async (name) => {
					const value = await AsyncStorage.getItem(name)
					return value ? JSON.parse(value) : null
				},
				setItem: async (name, value) => {
					await AsyncStorage.setItem(name, JSON.stringify(value))
				},
				removeItem: async (name) => {
					await AsyncStorage.removeItem(name)
				},
			},
		}
	)
)
