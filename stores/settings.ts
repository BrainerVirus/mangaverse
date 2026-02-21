import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeOption = 'Modern' | 'Cyberpunk' | 'Noir' | 'Sakura' | 'Forest' | 'Sunset' | 'Ocean' | 'Desert' | 'Lavender' | 'Slate';
export type ReaderMode = 'webtoon' | 'paged';
export type ReaderDirection = 'ltr' | 'rtl';
type TapZonePreset = 'balanced' | 'wide-center' | 'classic';
type ReaderFitMode = 'contain' | 'cover' | 'width';
type ChapterBackground = 'theme' | 'black' | 'white';
type ButtonLocation = 'left' | 'right';

interface SettingsState {
	theme: ThemeOption;
	readerMode: ReaderMode;
	readerDirection: ReaderDirection;
	prefetchCount: number;
	explicitContent: boolean;
	showProviderErrors: boolean;
	tapZonePreset: TapZonePreset;
	swipeEnabled: boolean;
	tapNavigationEnabled: boolean;
	autoHideChrome: boolean;
	fitMode: ReaderFitMode;
	lockRotation: boolean;
	pagePadding: boolean;
	downsamplePages: boolean;
	enablePageSaving: boolean;
	chapterBackground: ChapterBackground;
	chevronButtonLocation: ButtonLocation;
	settingsButtonLocation: ButtonLocation;
	pillarboxAmount: number;
	pinchToZoomEnabled: boolean;
	setTheme: (theme: ThemeOption) => void;
	setReaderMode: (mode: ReaderMode) => void;
	setReaderDirection: (direction: ReaderDirection) => void;
	setExplicitContent: (enabled: boolean) => void;
	setShowProviderErrors: (enabled: boolean) => void;
	setTapZonePreset: (preset: TapZonePreset) => void;
	setSwipeEnabled: (enabled: boolean) => void;
	setTapNavigationEnabled: (enabled: boolean) => void;
	setAutoHideChrome: (enabled: boolean) => void;
	setFitMode: (mode: ReaderFitMode) => void;
	setLockRotation: (enabled: boolean) => void;
	setPagePadding: (enabled: boolean) => void;
	setDownsamplePages: (enabled: boolean) => void;
	setEnablePageSaving: (enabled: boolean) => void;
	setChapterBackground: (bg: ChapterBackground) => void;
	setChevronButtonLocation: (loc: ButtonLocation) => void;
	setSettingsButtonLocation: (loc: ButtonLocation) => void;
	setPillarboxAmount: (amount: number) => void;
	setPinchToZoomEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			theme: 'Modern',
			readerMode: 'webtoon',
			readerDirection: 'rtl',
			prefetchCount: 6,
			explicitContent: false,
			showProviderErrors: true,
			tapZonePreset: 'balanced',
			swipeEnabled: true,
			tapNavigationEnabled: true,
			autoHideChrome: true,
			fitMode: 'contain',
			lockRotation: false,
			pagePadding: false,
			downsamplePages: false,
			enablePageSaving: true,
			chapterBackground: 'theme',
			chevronButtonLocation: 'right',
			settingsButtonLocation: 'right',
			pillarboxAmount: 0,
			pinchToZoomEnabled: true,
			setTheme: (theme) => set({ theme }),
			setReaderMode: (mode) => set({ readerMode: mode }),
			setReaderDirection: (direction) => set({ readerDirection: direction }),
			setExplicitContent: (enabled) => set({ explicitContent: enabled }),
			setShowProviderErrors: (enabled) => set({ showProviderErrors: enabled }),
			setTapZonePreset: (preset) => set({ tapZonePreset: preset }),
			setSwipeEnabled: (enabled) => set({ swipeEnabled: enabled }),
			setTapNavigationEnabled: (enabled) => set({ tapNavigationEnabled: enabled }),
			setAutoHideChrome: (enabled) => set({ autoHideChrome: enabled }),
			setFitMode: (mode) => set({ fitMode: mode }),
			setLockRotation: (enabled) => set({ lockRotation: enabled }),
			setPagePadding: (enabled) => set({ pagePadding: enabled }),
			setDownsamplePages: (enabled) => set({ downsamplePages: enabled }),
			setEnablePageSaving: (enabled) => set({ enablePageSaving: enabled }),
			setChapterBackground: (bg) => set({ chapterBackground: bg }),
			setChevronButtonLocation: (loc) => set({ chevronButtonLocation: loc }),
			setSettingsButtonLocation: (loc) => set({ settingsButtonLocation: loc }),
			setPillarboxAmount: (amount) => set({ pillarboxAmount: amount }),
			setPinchToZoomEnabled: (enabled) => set({ pinchToZoomEnabled: enabled }),
		}),
		{
			name: 'mangaverse-settings',
			partialize: (state) => ({
				theme: state.theme,
				readerMode: state.readerMode,
				readerDirection: state.readerDirection,
				prefetchCount: state.prefetchCount,
				explicitContent: state.explicitContent,
				showProviderErrors: state.showProviderErrors,
				tapZonePreset: state.tapZonePreset,
				swipeEnabled: state.swipeEnabled,
				tapNavigationEnabled: state.tapNavigationEnabled,
				autoHideChrome: state.autoHideChrome,
				fitMode: state.fitMode,
				lockRotation: state.lockRotation,
				pagePadding: state.pagePadding,
				downsamplePages: state.downsamplePages,
				enablePageSaving: state.enablePageSaving,
				chapterBackground: state.chapterBackground,
				chevronButtonLocation: state.chevronButtonLocation,
				settingsButtonLocation: state.settingsButtonLocation,
				pillarboxAmount: state.pillarboxAmount,
				pinchToZoomEnabled: state.pinchToZoomEnabled,
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
