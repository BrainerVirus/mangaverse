import { create } from "zustand"

type ThemeOption = "System" | "Light" | "Dark" | "AMOLED"

interface SettingsState {
	theme: ThemeOption
	readerMode: "rtl" | "ltr" | "vertical" | "webtoon" | "double"
	prefetchCount: number
	explicitContent: boolean
	setTheme: (theme: ThemeOption) => void
	setReaderMode: (mode: SettingsState["readerMode"]) => void
	setExplicitContent: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
	theme: "System",
	readerMode: "rtl",
	prefetchCount: 6,
	explicitContent: false,
	setTheme: (theme) => set({ theme }),
	setReaderMode: (mode) => set({ readerMode: mode }),
	setExplicitContent: (enabled) => set({ explicitContent: enabled }),
}))
