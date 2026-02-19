import type { ProviderMangaItem } from "../types/provider"

export const SECTION_ORDER = ["genres", "popular", "latest", "recent"]
export const PAGE_SIZE = 12
export const GENRE_PAGE_SIZE = 16

export const getHeroMetadata = (item?: ProviderMangaItem, providerName?: string) => {
	if (item?.lastChapter !== undefined && item.lastChapter !== null && String(item.lastChapter).length > 0) {
		return `Ch. ${item.lastChapter}`
	}
	if (item?.subtitle && item.subtitle.length > 0) {
		return item.subtitle
	}
	return providerName ?? ""
}
