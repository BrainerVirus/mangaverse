import { Link, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, FlatList, Pressable, Text, View, useWindowDimensions } from "react-native"

import { MangaCard } from "@components/MangaCard"
import { useExtensionsStore } from "@stores/extensions"
import type { ProviderMangaItem } from "../../types/provider"

const PAGE_SIZE = 20
const GENRE_RESULTS_PAGE_SIZE = 24

export default function DiscoverSection() {
	const params = useLocalSearchParams<{ sectionId: string; provider?: string; title?: string }>()
	const providers = useExtensionsStore((state) => state.providers)
	const sectionId = params.sectionId
	const providerId = params.provider ?? ""
	const [items, setItems] = useState<ProviderMangaItem[]>([])
	const [page, setPage] = useState(1)
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [hasMore, setHasMore] = useState(true)
	const [genreItems, setGenreItems] = useState<ProviderMangaItem[]>([])
	const { width } = useWindowDimensions()
	const columnCount = 3
	const horizontalPadding = 20
	const columnGap = 12
	const itemWidth = Math.floor(
		(width - horizontalPadding * 2 - columnGap * (columnCount - 1)) / columnCount
	)
	const title = useMemo(() => {
		if (typeof params.title === "string" && params.title.length > 0) {
			return params.title
		}
		return sectionId ?? "Section"
	}, [params.title, sectionId])

	const loadPage = useCallback(
		async (nextPage: number) => {
			const provider = providers[providerId]
			if (!provider || !sectionId) {
				setError("Provider not available")
				setLoading(false)
				return
			}
			if (sectionId === "genres") {
				const allGenres = await provider.getDiscoverGenres()
				const sliceStart = (nextPage - 1) * PAGE_SIZE
				const sliceEnd = sliceStart + PAGE_SIZE
				const data = allGenres.slice(sliceStart, sliceEnd)
				setGenreItems(allGenres)
				setItems((current) => (nextPage === 1 ? data : [...current, ...data]))
				setHasMore(sliceEnd < allGenres.length)
				setPage(nextPage)
				return
			}
			const data = await provider.getDiscoverSectionItems(sectionId, nextPage)
			setItems((current) => (nextPage === 1 ? data : [...current, ...data]))
			setHasMore(data.length >= PAGE_SIZE)
			setPage(nextPage)
		},
		[providerId, providers, sectionId]
	)

	const loadGenreResults = useCallback(
		async (nextPage: number) => {
			const provider = providers[providerId]
			if (!provider || !sectionId) {
				setError("Provider not available")
				setLoading(false)
				return
			}
			const data = await provider.getDiscoverSectionItems("genres", nextPage, {
				genreId: sectionId,
			})
			setItems((current) => (nextPage === 1 ? data : [...current, ...data]))
			setHasMore(data.length >= GENRE_RESULTS_PAGE_SIZE)
			setPage(nextPage)
		},
		[providerId, providers, sectionId]
	)

	useEffect(() => {
		setLoading(true)
		setError(null)
		const isGenreSelection = sectionId && sectionId !== "genres"
		const load = isGenreSelection ? loadGenreResults : loadPage
		load(1)
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false))
	}, [loadGenreResults, loadPage, sectionId])

	const handleEndReached = () => {
		if (loadingMore || loading || !hasMore) {
			return
		}
		setLoadingMore(true)
		const isGenreSelection = sectionId && sectionId !== "genres"
		const load = isGenreSelection ? loadGenreResults : loadPage
		load(page + 1)
			.catch(() => {})
			.finally(() => setLoadingMore(false))
	}

	return (
		<View className="flex-1 bg-background">
			<FlatList
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: 24 }}
				data={items}
				numColumns={columnCount}
				keyExtractor={(item) => item.id}
				ListHeaderComponent={
					<View className="pb-4 pt-4">
						<View className="flex-row items-center justify-between">
							<Link href="/discover" className="rounded-full bg-card px-3 py-2">
								<Text className="text-xs font-semibold text-accent">Back</Text>
							</Link>
							<Text className="text-base font-semibold text-foreground">{title}</Text>
							<View className="w-[48px]" />
						</View>
						<Text className="mt-3 text-sm text-muted">All titles</Text>
					</View>
				}
				ListFooterComponent={
					loadingMore ? (
						<View className="items-center py-6">
							<ActivityIndicator color="#ff6b6b" />
						</View>
					) : null
				}
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.6}
				renderItem={({ item, index }) => {
					const isRowEnd = (index + 1) % columnCount === 0
					return (
						<Link
							href={{
								pathname: "/manga/[id]",
								params: { id: item.id, provider: providerId },
							}}
							asChild
						>
							<Pressable
								style={{
									width: itemWidth,
									marginRight: isRowEnd ? 0 : columnGap,
									marginBottom: 16,
								}}
							>
								<MangaCard
									title={item.title}
									subtitle={item.subtitle}
									coverUrl={item.coverUrl}
								/>
							</Pressable>
						</Link>
					)
				}}
				ListEmptyComponent={
					loading ? (
						<View className="items-center justify-center rounded-[22px] bg-card p-6">
							<ActivityIndicator color="#ff6b6b" />
							<Text className="mt-3 text-sm text-muted">Loading titles…</Text>
						</View>
					) : error ? (
						<View className="rounded-[22px] bg-card p-6">
							<Text className="text-base font-semibold text-foreground">
								Unable to load
							</Text>
							<Text className="mt-2 text-sm text-muted">{error}</Text>
						</View>
					) : (
						<View className="rounded-[22px] bg-card p-6">
							<Text className="text-base font-semibold text-foreground">No titles found</Text>
							<Text className="mt-2 text-sm text-muted">
								This section has no items yet.
							</Text>
						</View>
					)
				}
			/>
		</View>
	)
}
