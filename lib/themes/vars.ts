import { vars } from "nativewind"

import { useColorScheme } from "react-native"

import type { ThemeOption } from "@stores/settings"
import { useSettingsStore } from "@stores/settings"

import { THEME_VARS, type ThemeMode, type ThemeVars } from "./themes"

type NativeThemeVars = ReturnType<typeof vars>

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const toHexChannel = (value: number) => {
	const clamped = clamp(value)
	const rounded = Math.round(clamped * 255)
	return rounded.toString(16).padStart(2, "0")
}

export const oklchToHex = (value: string) => {
	const match = /oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*(?:\/\s*([0-9.]+%?))?\s*\)/i.exec(
		value
	)
	if (!match) {
		return null
	}
	const lightness = Number(match[1])
	const chroma = Number(match[2])
	const hue = Number(match[3])
	if (Number.isNaN(lightness) || Number.isNaN(chroma) || Number.isNaN(hue)) {
		return null
	}
	const hueRadians = (hue * Math.PI) / 180
	const a = chroma * Math.cos(hueRadians)
	const b = chroma * Math.sin(hueRadians)

	const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
	const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
	const s_ = lightness - 0.0894841775 * a - 1.291485548 * b

	const l = l_ ** 3
	const m = m_ ** 3
	const s = s_ ** 3

	const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
	const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
	const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

	const toSrgb = (channel: number) =>
		channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

	const red = toSrgb(rLinear)
	const green = toSrgb(gLinear)
	const blue = toSrgb(bLinear)

	return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
}

const toNativeValue = (value: string) => {
	const normalized = value.trim()
	if (normalized.startsWith("#") || normalized.startsWith("rgb")) {
		return normalized
	}
	if (normalized.startsWith("oklch")) {
		return oklchToHex(normalized) ?? normalized
	}
	return normalized
}

const toNativeVars = (themeVars: ThemeVars) => {
	const entries = Object.entries(themeVars).map(([key, value]) => [key, toNativeValue(value)])
	return Object.fromEntries(entries) as ThemeVars
}

export const getThemeVars = (theme: ThemeOption, mode: ThemeMode): NativeThemeVars => {
	const themeVars = THEME_VARS[theme][mode]
	return vars(toNativeVars(themeVars))
}

export const useThemeColors = () => {
	const theme = useSettingsStore((state) => state.theme)
	const colorScheme = useColorScheme()
	const mode: ThemeMode = colorScheme === "light" ? "light" : "dark"
	const themeVars = THEME_VARS[theme][mode]
	return {
		accent: toNativeValue(themeVars["--accent"]),
		accentForeground: toNativeValue(themeVars["--accent-foreground"]),
		background: toNativeValue(themeVars["--background"]),
		border: toNativeValue(themeVars["--border"]),
		card: toNativeValue(themeVars["--card"]),
		error: toNativeValue(themeVars["--error"]),
		foreground: toNativeValue(themeVars["--foreground"]),
		muted: toNativeValue(themeVars["--muted"]),
		mutedForeground: toNativeValue(themeVars["--muted-foreground"]),
		success: toNativeValue(themeVars["--success"]),
		warning: toNativeValue(themeVars["--warning"]),
	}
}

export const getThemePreview = (theme: ThemeOption, mode: ThemeMode) => {
	const themeVars = THEME_VARS[theme][mode]
	return {
		background: toNativeValue(themeVars["--background"]),
		foreground: toNativeValue(themeVars["--foreground"]),
		muted: toNativeValue(themeVars["--muted"]),
		border: toNativeValue(themeVars["--border"]),
		accent: toNativeValue(themeVars["--accent"]),
	}
}
