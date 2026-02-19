const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const withAlpha = (hex: string, alpha: number) => {
	if (!hex.startsWith('#')) {
		return hex;
	}
	const normalized = hex.replace('#', '');
	if (normalized.length !== 6) {
		return hex;
	}
	const r = parseInt(normalized.slice(0, 2), 16);
	const g = parseInt(normalized.slice(2, 4), 16);
	const b = parseInt(normalized.slice(4, 6), 16);
	const safeAlpha = clamp(alpha);
	return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
};
