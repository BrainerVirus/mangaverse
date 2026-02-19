import { vars } from 'nativewind';

import { useColorScheme } from 'react-native';

import type { ThemeOption } from '@stores/settings';
import { useSettingsStore } from '@stores/settings';

import { oklchToHex } from '@lib/colors/oklch';

import { THEME_VARS, type ThemeMode, type ThemeVars } from './themes';

type NativeThemeVars = ReturnType<typeof vars>;

const toNativeValue = (value: string) => {
	const normalized = value.trim();
	if (normalized.startsWith('#') || normalized.startsWith('rgb')) {
		return normalized;
	}
	if (normalized.startsWith('oklch')) {
		return oklchToHex(normalized) ?? normalized;
	}
	return normalized;
};

const toNativeVars = (themeVars: ThemeVars) => {
	const entries = Object.entries(themeVars).map(([key, value]) => [key, toNativeValue(value)]);
	return Object.fromEntries(entries) as ThemeVars;
};

export const getThemeVars = (theme: ThemeOption, mode: ThemeMode): NativeThemeVars => {
	const themeVars = THEME_VARS[theme][mode];
	return vars(toNativeVars(themeVars));
};

export const useThemeColors = () => {
	const theme = useSettingsStore((state) => state.theme);
	const colorScheme = useColorScheme();
	const mode: ThemeMode = colorScheme === 'light' ? 'light' : 'dark';
	const themeVars = THEME_VARS[theme][mode];
	return {
		accent: toNativeValue(themeVars['--accent']),
		accentForeground: toNativeValue(themeVars['--accent-foreground']),
		background: toNativeValue(themeVars['--background']),
		border: toNativeValue(themeVars['--border']),
		card: toNativeValue(themeVars['--card']),
		error: toNativeValue(themeVars['--error']),
		foreground: toNativeValue(themeVars['--foreground']),
		muted: toNativeValue(themeVars['--muted']),
		mutedForeground: toNativeValue(themeVars['--muted-foreground']),
		overlay: toNativeValue(themeVars['--overlay'] ?? themeVars['--background']),
		primary: toNativeValue(themeVars['--primary']),
		primaryForeground: toNativeValue(themeVars['--primary-foreground']),
		secondary: toNativeValue(themeVars['--secondary']),
		secondaryForeground: toNativeValue(themeVars['--secondary-foreground']),
		success: toNativeValue(themeVars['--success']),
		warning: toNativeValue(themeVars['--warning']),
	};
};

export const getThemePreview = (theme: ThemeOption, mode: ThemeMode) => {
	const themeVars = THEME_VARS[theme][mode];
	return {
		accent: toNativeValue(themeVars['--accent']),
		background: toNativeValue(themeVars['--background']),
		border: toNativeValue(themeVars['--border']),
		foreground: toNativeValue(themeVars['--foreground']),
		muted: toNativeValue(themeVars['--muted']),
		primary: toNativeValue(themeVars['--primary']),
	};
};
