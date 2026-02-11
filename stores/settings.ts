import { create } from "zustand"

type ThemeOption = "System" | "Modern" | "Cyberpunk" | "Noir" | "Sakura" | "Forest"
type ReaderMode = "rtl" | "ltr" | "vertical" | "webtoon" | "double"
type TapZonePreset = "balanced" | "wide-center" | "classic"
type ReaderFitMode = "contain" | "cover" | "width"
type ReaderBackground = "ink" | "graphite" | "parchment"

interface SettingsState {
	theme: ThemeOption
	readerMode: ReaderMode
	prefetchCount: number
	explicitContent: boolean
	tapZonePreset: TapZonePreset
	swipeEnabled: boolean
	tapNavigationEnabled: boolean
	autoHideChrome: boolean
	fitMode: ReaderFitMode
	background: ReaderBackground
	lockRotation: boolean
	setTheme: (theme: ThemeOption) => void
	setReaderMode: (mode: ReaderMode) => void
	setExplicitContent: (enabled: boolean) => void
	setTapZonePreset: (preset: TapZonePreset) => void
	setSwipeEnabled: (enabled: boolean) => void
	setTapNavigationEnabled: (enabled: boolean) => void
	setAutoHideChrome: (enabled: boolean) => void
	setFitMode: (mode: ReaderFitMode) => void
	setBackground: (background: ReaderBackground) => void
	setLockRotation: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
	theme: "System",
	readerMode: "webtoon",
	prefetchCount: 6,
	explicitContent: false,
	tapZonePreset: "balanced",
	swipeEnabled: true,
	tapNavigationEnabled: true,
	autoHideChrome: true,
	fitMode: "contain",
	background: "ink",
	lockRotation: false,
	setTheme: (theme) => set({ theme }),
	setReaderMode: (mode) => set({ readerMode: mode }),
	setExplicitContent: (enabled) => set({ explicitContent: enabled }),
	setTapZonePreset: (preset) => set({ tapZonePreset: preset }),
	setSwipeEnabled: (enabled) => set({ swipeEnabled: enabled }),
	setTapNavigationEnabled: (enabled) => set({ tapNavigationEnabled: enabled }),
	setAutoHideChrome: (enabled) => set({ autoHideChrome: enabled }),
	setFitMode: (mode) => set({ fitMode: mode }),
	setBackground: (background) => set({ background }),
	setLockRotation: (enabled) => set({ lockRotation: enabled }),
}))
