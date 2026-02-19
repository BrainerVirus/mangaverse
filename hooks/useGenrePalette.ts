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
	const accent = THEME_VARS[theme][mode]['--accent'];
	const desiredCount = Math.max(1, neededCount);
	const needsNormalization = currentPalette.some((color) => !isHexColor(color));

	if (!needsNormalization && desiredCount <= currentPalette.length) {
		return currentPalette;
	}

	const nextPalette = needsNormalization
		? deriveGenrePalette(accent, Math.max(desiredCount, currentPalette.length))
		: extendGenrePalette(currentPalette, accent, Math.max(desiredCount, currentPalette.length));
	if (nextPalette.length !== currentPalette.length) {
		setPalette(themeKey, nextPalette);
		return nextPalette;
	}

	if (needsNormalization) {
		setPalette(themeKey, nextPalette);
	}
	return nextPalette;
};
