interface DiscoverLayoutOptions {
	pagePaddingRatio?: number;
	gapRatio?: number;
	minColumns?: number;
	minCardRatio?: number;
}

interface DiscoverLayoutMetrics {
	pagePadding: number;
	gap: number;
	columns: number;
	cardWidth: number;
	heroWidth: number;
	peek: number;
}

export function getDiscoverLayout(width: number, options: DiscoverLayoutOptions = {}): DiscoverLayoutMetrics {
	const pagePaddingRatio = options.pagePaddingRatio ?? 0.04;
	const gapRatio = options.gapRatio ?? 0.03;
	const minColumns = options.minColumns ?? 3;
	const minCardRatio = options.minCardRatio ?? 0.26;

	const pagePadding = Math.max(12, Math.round(width * pagePaddingRatio));
	const gap = Math.max(10, Math.round(width * gapRatio));
	const minCardWidth = Math.max(96, Math.round(width * minCardRatio));
	const available = Math.max(0, width - pagePadding * 2);
	const columns = Math.max(minColumns, Math.floor((available + gap) / (minCardWidth + gap)));
	const cardWidth = Math.floor((available - gap * (columns - 1)) / columns);
	const peek = Math.max(18, Math.round(width * 0.05));
	const heroWidth = available;
	return {
		pagePadding,
		gap,
		columns,
		cardWidth,
		heroWidth,
		peek,
	};
}
