import { formatOklch, oklchToHex, parseOklch } from './oklch';

const defaultAccent = 'oklch(0.7 0.18 25)';

const hueOffsets = [0, 24, -24, 48, -48, 72, -72, 96, -96, 120, -120, 144];

const pickAccent = (accent: string) => parseOklch(accent) ?? parseOklch(defaultAccent);
const defaultAccentHex = oklchToHex(defaultAccent) ?? '#8b5cf6';

export const deriveGenrePalette = (accent: string, count: number) => {
	const parsed = pickAccent(accent);
	if (!parsed) {
		if (accent.startsWith('#')) {
			return Array.from({ length: count }, () => accent);
		}
		return Array.from({ length: count }, () => defaultAccentHex);
	}
	const { lightness, chroma, hue } = parsed;
	const palette: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const offset = hueOffsets[index % hueOffsets.length] + Math.floor(index / hueOffsets.length) * 12;
		const nextHue = hue + offset;
		const nextLightness = Math.min(0.82, lightness + (index % 2 === 0 ? 0.08 : 0.02));
		const nextChroma = Math.min(0.28, chroma + (index % 3 === 0 ? 0.06 : 0.02));
		const nextColor = formatOklch(nextLightness, nextChroma, nextHue);
		palette.push(oklchToHex(nextColor) ?? defaultAccentHex);
	}
	return palette;
};

export const extendGenrePalette = (current: string[], accent: string, count: number) => {
	if (current.length >= count) {
		return current;
	}
	const nextPalette = deriveGenrePalette(accent, count);
	return nextPalette.length ? nextPalette : current;
};
