export interface ProviderMeta {
	id: string
	name: string
	version: string
	baseUrl: string
	supportedLanguages: string[]
	supportsAuth: boolean
	icon?: string
}

export interface ProviderFilter {
	id: string
	label: string
	type: "select" | "multi" | "text" | "toggle"
	options?: { id: string; label: string }[]
}

export interface ProviderMangaItem {
	id: string
	title: string
	coverUrl?: string
	subtitle?: string
	description?: string
	tags?: string[]
	lastChapter?: string | number
	language?: string
}

export interface ProviderDiscoverSection {
	id: string
	title: string
	items: ProviderMangaItem[]
}

export interface ProviderChapter {
	id: string
	title: string
	chapterNumber?: number
	volumeNumber?: number
	language?: string
	group?: string
	publishedAt?: number
}

export interface ProviderPage {
	url: string
	headers?: Record<string, string>
}

export interface ProviderContract {
	meta: ProviderMeta
	getDiscoverGenres: () => Promise<ProviderMangaItem[]>
	getDiscoverSections: () => Promise<ProviderDiscoverSection[]>
	getDiscoverSectionItems: (
		sectionId: string,
		page: number,
		filters?: Record<string, unknown>
	) => Promise<ProviderMangaItem[]>
	search: (
		query: string,
		page: number,
		filters?: Record<string, unknown>
	) => Promise<ProviderMangaItem[]>
	getAvailableFilters: () => Promise<ProviderFilter[]>
	getMangaDetails: (providerMangaId: string) => Promise<ProviderMangaItem>
	getChapterList: (
		providerMangaId: string,
		languages?: string[]
	) => Promise<ProviderChapter[]>
	getChapterPages: (providerChapterId: string) => Promise<ProviderPage[]>
	login?: () => Promise<void>
	logout?: () => Promise<void>
	getFavorites?: () => Promise<ProviderMangaItem[]>
	getReadingProgress?: () => Promise<Record<string, number>>
}

export interface ExtensionIndexItem {
	id: string
	name: string
	version: string
	icon?: string
	languages: string[]
	nsfw: boolean
	bundleUrl: string
	minAppVersion?: string
}
