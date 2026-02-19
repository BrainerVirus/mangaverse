import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeOption = 'Modern' | 'Cyberpunk' | 'Noir' | 'Sakura' | 'Forest' | 'Sunset' | 'Ocean' | 'Desert' | 'Lavender' | 'Slate';
type ReaderMode = 'rtl' | 'ltr' | 'vertical' | 'webtoon' | 'double';
type TapZonePreset = 'balanced' | 'wide-center' | 'classic';
type ReaderFitMode = 'contain' | 'cover' | 'width';
type ReaderBackground = 'ink' | 'graphite' | 'parchment';

interface SettingsState {
	theme: ThemeOption;
	readerMode: ReaderMode;
	prefetchCount: number;
	explicitContent: boolean;
	showProviderErrors: boolean;
	tapZonePreset: TapZonePreset;
	swipeEnabled: boolean;
	tapNavigationEnabled: boolean;
	autoHideChrome: boolean;
	fitMode: ReaderFitMode;
	background: ReaderBackground;
	lockRotation: boolean;
	genrePaletteByTheme: Record<string, string[]>;
	setTheme: (theme: ThemeOption) => void;
	setReaderMode: (mode: ReaderMode) => void;
	setExplicitContent: (enabled: boolean) => void;
	setShowProviderErrors: (enabled: boolean) => void;
	setTapZonePreset: (preset: TapZonePreset) => void;
	setSwipeEnabled: (enabled: boolean) => void;
	setTapNavigationEnabled: (enabled: boolean) => void;
	setAutoHideChrome: (enabled: boolean) => void;
	setFitMode: (mode: ReaderFitMode) => void;
	setBackground: (background: ReaderBackground) => void;
	setLockRotation: (enabled: boolean) => void;
	setGenrePalette: (key: string, palette: string[]) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			theme: 'Modern',
			readerMode: 'webtoon',
			prefetchCount: 6,
			explicitContent: false,
			showProviderErrors: true,
			tapZonePreset: 'balanced',
			swipeEnabled: true,
			tapNavigationEnabled: true,
			autoHideChrome: true,
			fitMode: 'contain',
			background: 'ink',
			lockRotation: false,
			genrePaletteByTheme: {},
			setTheme: (theme) => set({ theme }),
			setReaderMode: (mode) => set({ readerMode: mode }),
			setExplicitContent: (enabled) => set({ explicitContent: enabled }),
			setShowProviderErrors: (enabled) => set({ showProviderErrors: enabled }),
			setTapZonePreset: (preset) => set({ tapZonePreset: preset }),
			setSwipeEnabled: (enabled) => set({ swipeEnabled: enabled }),
			setTapNavigationEnabled: (enabled) => set({ tapNavigationEnabled: enabled }),
			setAutoHideChrome: (enabled) => set({ autoHideChrome: enabled }),
			setFitMode: (mode) => set({ fitMode: mode }),
			setBackground: (background) => set({ background }),
			setLockRotation: (enabled) => set({ lockRotation: enabled }),
			setGenrePalette: (key, palette) =>
				set((state) => ({
					genrePaletteByTheme: { ...state.genrePaletteByTheme, [key]: palette },
				})),
		}),
		{
			name: 'mangaverse-settings',
			partialize: (state) => ({
				theme: state.theme,
				readerMode: state.readerMode,
				prefetchCount: state.prefetchCount,
				explicitContent: state.explicitContent,
				showProviderErrors: state.showProviderErrors,
				tapZonePreset: state.tapZonePreset,
				swipeEnabled: state.swipeEnabled,
				tapNavigationEnabled: state.tapNavigationEnabled,
				autoHideChrome: state.autoHideChrome,
				fitMode: state.fitMode,
				background: state.background,
				lockRotation: state.lockRotation,
				genrePaletteByTheme: state.genrePaletteByTheme,
			}),
			storage: {
				getItem: async (name) => {
					const value = await AsyncStorage.getItem(name);
					return value ? JSON.parse(value) : null;
				},
				setItem: async (name, value) => {
					await AsyncStorage.setItem(name, JSON.stringify(value));
				},
				removeItem: async (name) => {
					await AsyncStorage.removeItem(name);
				},
			},
		},
	),
);
