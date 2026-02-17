interface DiscoverLayoutOptions {
	pagePaddingRatio?: number
	gapRatio?: number
	minColumns?: number
	minCardRatio?: number
}

interface DiscoverLayoutMetrics {
	pagePadding: number
	gap: number
	columns: number
	cardWidth: number
	heroWidth: number
}

export function getDiscoverLayout(
	width: number,
	options: DiscoverLayoutOptions = {}
): DiscoverLayoutMetrics {
	const pagePaddingRatio = options.pagePaddingRatio ?? 0.04
	const gapRatio = options.gapRatio ?? 0.03
	const minColumns = options.minColumns ?? 3
	const minCardRatio = options.minCardRatio ?? 0.26

	const pagePadding = Math.max(12, Math.round(width * pagePaddingRatio))
	const gap = Math.max(10, Math.round(width * gapRatio))
	const minCardWidth = Math.max(96, Math.round(width * minCardRatio))
	const available = Math.max(0, width - pagePadding * 2)
	const columns = Math.max(minColumns, Math.floor((available + gap) / (minCardWidth + gap)))
	const cardWidth = Math.floor((available - gap * (columns - 1)) / columns)
	const sizeScale = 1.1
	const heroWidth = Math.max(0, width - pagePadding * 2) * sizeScale

	const scaledCardWidth = Math.floor(cardWidth * sizeScale)
	const totalWidth = scaledCardWidth * columns + gap * (columns - 1) + pagePadding * 2
	const clampedCardWidth = totalWidth > width ? Math.floor(cardWidth) : scaledCardWidth
	return {
		pagePadding,
		gap,
		columns,
		cardWidth: clampedCardWidth,
		heroWidth,
	}
}
