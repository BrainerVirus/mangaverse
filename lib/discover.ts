import type { ProviderMangaItem } from "../types/provider"

export const SECTION_ORDER = ["genres", "popular", "latest", "recent"]
export const PAGE_SIZE = 12
export const GENRE_PAGE_SIZE = 16
export const GENRE_COLORS = ["#ff6b6b", "#ff8fab", "#ff9f6b", "#ffa9a9", "#ff7f8a", "#ff996b"]

export const getHeroSubtitle = (item?: ProviderMangaItem) =>
	item?.description?.trim()?.length ? item.description : "Featured from your provider"
