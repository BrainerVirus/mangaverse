import type { ProviderMangaItem } from "../types/provider"

export const SECTION_ORDER = ["genres", "popular", "latest", "recent"]
export const PAGE_SIZE = 12
export const GENRE_PAGE_SIZE = 16
export const GENRE_COLORS = [
	"oklch(0.7 0.2 25)",
	"oklch(0.78 0.16 345)",
	"oklch(0.78 0.16 45)",
	"oklch(0.82 0.12 10)",
	"oklch(0.72 0.17 5)",
	"oklch(0.8 0.14 65)",
]

export const getHeroSubtitle = (item?: ProviderMangaItem) =>
	item?.description?.trim()?.length ? item.description : "Featured from your provider"
