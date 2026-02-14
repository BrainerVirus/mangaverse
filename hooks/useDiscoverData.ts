import { useEffect, useMemo, useRef, useState } from "react"

import type { ProviderContract, ProviderDiscoverSection, ProviderMangaItem } from "../types/provider"

import { GENRE_PAGE_SIZE, PAGE_SIZE, SECTION_ORDER } from "@lib/discover"

interface UseDiscoverDataOptions {
	providersMap: Record<string, ProviderContract>
	selectedProviderId?: string
	refreshProviders: () => Promise<void>
}

interface UseDiscoverDataResult {
	sections: ProviderDiscoverSection[]
	orderedSections: ProviderDiscoverSection[]
	sectionItems: Record<string, ProviderMangaItem[]>
	loading: boolean
	error: string | null
	heroItems: ProviderMangaItem[]
	loadMore: (sectionId: string) => Promise<void>
}

export function useDiscoverData({
	providersMap,
	selectedProviderId,
	refreshProviders,
}: UseDiscoverDataOptions): UseDiscoverDataResult {
	const [sections, setSections] = useState<ProviderDiscoverSection[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [genreItems, setGenreItems] = useState<ProviderMangaItem[]>([])
	const [sectionItems, setSectionItems] = useState<Record<string, ProviderMangaItem[]>>({})
	const [sectionPages, setSectionPages] = useState<Record<string, number>>({})
	const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({})
	const [sectionHasMore, setSectionHasMore] = useState<Record<string, boolean>>({})
	const loadRequestId = useRef(0)

	useEffect(() => {
		refreshProviders().catch(() => {})
	}, [refreshProviders])

	useEffect(() => {
		setSections([])
		setGenreItems([])
		setSectionItems({})
		setSectionPages({})
		setSectionLoading({})
		setSectionHasMore({})
		setError(null)
	}, [selectedProviderId])

	useEffect(() => {
		const providerId = selectedProviderId
		if (!providerId) {
			return
		}
		const provider = providersMap[providerId]
		if (!provider) {
			return
		}
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId
		setLoading(true)
		setError(null)
		const loadSections = async () => {
			const baseSections = await provider.getDiscoverSections()
			const normalizedSections = baseSections.some((section) => section.id === "genres")
				? baseSections
				: [{ id: "genres", title: "Genres", items: [] }, ...baseSections]
			const [genreItems, ...sectionResults] = await Promise.all([
				provider.getDiscoverGenres(),
				...normalizedSections
					.filter((section: ProviderDiscoverSection) => section.id !== "genres")
					.map(async (section: ProviderDiscoverSection) => {
						const items = await provider.getDiscoverSectionItems(section.id, 1)
						return { id: section.id, items }
					}),
			])
			const initialItems: Record<string, ProviderMangaItem[]> = {
				genres: genreItems.slice(0, GENRE_PAGE_SIZE),
			}
			const initialPages: Record<string, number> = { genres: 1 }
			const initialHasMore: Record<string, boolean> = {
				genres: genreItems.length > GENRE_PAGE_SIZE,
			}
			sectionResults.forEach((result: { id: string; items: ProviderMangaItem[] }) => {
				initialItems[result.id] = result.items
				initialPages[result.id] = 1
				initialHasMore[result.id] = result.items.length >= PAGE_SIZE
			})
			if (loadRequestId.current !== requestId) {
				return
			}
			setSections(normalizedSections)
			setGenreItems(genreItems)
			setSectionItems(initialItems)
			setSectionPages(initialPages)
			setSectionHasMore(initialHasMore)
		}
		loadSections()
			.catch((err) =>
				setError(err instanceof Error ? err.message : "Failed to load discover sections")
			)
			.finally(() => {
				if (loadRequestId.current === requestId) {
					setLoading(false)
				}
			})
	}, [providersMap, selectedProviderId])

	const orderedSections = useMemo(() => {
		const lookup = new Map(sections.map((section) => [section.id, section]))
		const ordered = SECTION_ORDER.map((id) => lookup.get(id)).filter(
			(section): section is ProviderDiscoverSection => Boolean(section)
		)
		const remaining = sections.filter(
			(section: ProviderDiscoverSection) => !SECTION_ORDER.includes(section.id)
		)
		return [...ordered, ...remaining]
	}, [sections])

	const heroItems = useMemo(() => {
		const firstList = sectionItems.popular ?? sectionItems.latest ?? sectionItems.recent ?? []
		if (firstList.length > 0) {
			return firstList
		}
		return Object.entries(sectionItems)
			.filter(([key, value]) => key !== "genres" && value.length > 0)
			.map(([, value]) => value)
			.flat()
	}, [sectionItems])

	const loadMore = async (sectionId: string) => {
		if (sectionLoading[sectionId]) {
			return
		}
		if (sectionHasMore[sectionId] === false) {
			return
		}
		const providerId = selectedProviderId
		if (!providerId) {
			return
		}
		const provider = providersMap[providerId]
		if (!provider) {
			return
		}
		setSectionLoading((current) => ({ ...current, [sectionId]: true }))
		const nextPage = (sectionPages[sectionId] ?? 1) + 1
		if (sectionId === "genres") {
			const sliceStart = (nextPage - 1) * GENRE_PAGE_SIZE
			const sliceEnd = sliceStart + GENRE_PAGE_SIZE
			const nextItems = genreItems.slice(sliceStart, sliceEnd)
			setSectionItems((current) => ({
				...current,
				[sectionId]: [...(current[sectionId] ?? []), ...nextItems],
			}))
			setSectionPages((current) => ({ ...current, [sectionId]: nextPage }))
			setSectionHasMore((current) => ({
				...current,
				[sectionId]: sliceEnd < genreItems.length,
			}))
			setSectionLoading((current) => ({ ...current, [sectionId]: false }))
			return
		}
		const items = await provider.getDiscoverSectionItems(sectionId, nextPage)
		setSectionItems((current) => ({
			...current,
			[sectionId]: [...(current[sectionId] ?? []), ...items],
		}))
		setSectionPages((current) => ({ ...current, [sectionId]: nextPage }))
		setSectionHasMore((current) => ({
			...current,
			[sectionId]: items.length >= PAGE_SIZE,
		}))
		setSectionLoading((current) => ({ ...current, [sectionId]: false }))
	}

	return {
		sections,
		orderedSections,
		sectionItems,
		loading,
		error,
		heroItems,
		loadMore,
	}
}
