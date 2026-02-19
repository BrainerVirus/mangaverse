import { useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { deriveGenrePalette, extendGenrePalette } from '@lib/colors/genre-palette';
import { THEME_VARS } from '@lib/themes/themes';
import { useSettingsStore } from '@stores/settings';

import type { ThemeMode } from '@lib/themes/themes';

const getThemeKey = (theme: string, mode: ThemeMode) => `${theme}:${mode}`;
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export const useGenrePalette = (neededCount: number) => {
	const theme = useSettingsStore((state) => state.theme);
	const paletteByTheme = useSettingsStore((state) => state.genrePaletteByTheme);
	const setPalette = useSettingsStore((state) => state.setGenrePalette);
	const colorScheme = useColorScheme();
	const mode: ThemeMode = colorScheme === 'light' ? 'light' : 'dark';
	const themeKey = getThemeKey(theme, mode);
	const currentPalette = paletteByTheme[themeKey] ?? [];
	const accent = THEME_VARS[theme][mode]['--primary'];
	const desiredCount = Math.max(1, neededCount);
	const needsNormalization = currentPalette.some((color) => !isHexColor(color));

	// Compute the palette synchronously so the UI never renders with stale colors.
	// The store is persisted in a useEffect to avoid setState-during-render.
	const resolvedPalette = useMemo(() => {
		if (!needsNormalization && desiredCount <= currentPalette.length) {
			return currentPalette;
		}
		return needsNormalization
			? deriveGenrePalette(accent, Math.max(desiredCount, currentPalette.length))
			: extendGenrePalette(currentPalette, accent, Math.max(desiredCount, currentPalette.length));
	}, [accent, currentPalette, desiredCount, needsNormalization]);

	// Persist to store only when the palette actually changed
	useEffect(() => {
		if (resolvedPalette !== currentPalette && resolvedPalette.length > 0) {
			setPalette(themeKey, resolvedPalette);
		}
	}, [resolvedPalette, currentPalette, setPalette, themeKey]);

	return resolvedPalette;
};
