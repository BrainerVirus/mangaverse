import { Link } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import { useEffect, useMemo, useRef, useState } from "react"
import {
	ActivityIndicator,
	Animated,
	Image,
	Pressable,
	ScrollView,
	Text,
	View,
	useWindowDimensions,
} from "react-native"

import { MangaCard } from "@components/MangaCard"
import { useExtensionsStore } from "@stores/extensions"
import { useSettingsStore } from "@stores/settings"
import { useFavoritesStore } from "@services/library/favorites"
import type { ProviderDiscoverSection, ProviderMangaItem } from "../../types/provider"

const SECTION_ORDER = ["genres", "popular", "latest", "recent"]
const PAGE_SIZE = 12
const GENRE_PAGE_SIZE = 16
const genreColors = ["#ff6b6b", "#ff8fab", "#ff9f6b", "#ffa9a9", "#ff7f8a", "#ff996b"]

const getHeroSubtitle = (item?: ProviderMangaItem) =>
	item?.description?.trim()?.length
		? item.description
		: "Featured from your provider"

export default function Discover() {
	const providers = useExtensionsStore((state) => state.enabledProviders)
	const selectedProviderId = useExtensionsStore((state) => state.selectedProviderId)
	const setSelectedProvider = useExtensionsStore((state) => state.setSelectedProvider)
	const providersMap = useExtensionsStore((state) => state.providers)
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders)
	const loadErrors = useExtensionsStore((state) => state.loadErrors)
	const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
	const [sections, setSections] = useState<ProviderDiscoverSection[]>(
		selectedProvider?.sections ?? []
	)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [sectionItems, setSectionItems] = useState<Record<string, ProviderMangaItem[]>>({})
	const [sectionPages, setSectionPages] = useState<Record<string, number>>({})
	const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({})
	const [sectionHasMore, setSectionHasMore] = useState<Record<string, boolean>>({})
	const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({})
	const indicatorX = useRef(new Animated.Value(0)).current
	const indicatorWidth = useRef(new Animated.Value(0)).current
	const indicatorReady = useRef(false)
	const favoriteStore = useFavoritesStore()
	const showProviderErrors = useSettingsStore((state) => state.showProviderErrors)
	const hasProviders = providers.length > 0
	const providerLoadError = selectedProviderId ? loadErrors[selectedProviderId] : undefined
	const orderedSections = useMemo(() => {
		const lookup = new Map(sections.map((section) => [section.id, section]))
		const ordered = SECTION_ORDER.map((id) => lookup.get(id)).filter(
			(section): section is ProviderDiscoverSection => Boolean(section)
		)
		const remaining = sections.filter((section) => !SECTION_ORDER.includes(section.id))
		return [...ordered, ...remaining]
	}, [sections])
	const [errorDrawerOpen, setErrorDrawerOpen] = useState(false)
	const [isDrawerExpanded, setIsDrawerExpanded] = useState(false)
	const errorDrawerHeight = useRef(new Animated.Value(0)).current
	const errorDrawerBaseHeight = 260
	const errorDrawerMaxHeight = 520
	const { width: screenWidth } = useWindowDimensions()
	const pagePadding = 16
	const heroSpacing = 16
	const heroWidth = screenWidth - pagePadding * 2
	const heroScrollX = useRef(new Animated.Value(0)).current
	const heroScrollRef = useRef<ScrollView>(null)
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
	const heroProvider = selectedProvider?.name ?? ""

	useEffect(() => {
		if (!showProviderErrors || !providerLoadError) {
			setErrorDrawerOpen(false)
			return
		}
		setErrorDrawerOpen(true)
	}, [providerLoadError, showProviderErrors])

	useEffect(() => {
		const targetHeight = errorDrawerOpen
			? isDrawerExpanded
				? errorDrawerMaxHeight
				: errorDrawerBaseHeight
			: 0
		Animated.timing(errorDrawerHeight, {
			toValue: targetHeight,
			duration: 220,
			useNativeDriver: false,
		}).start()
	}, [errorDrawerBaseHeight, errorDrawerHeight, errorDrawerMaxHeight, errorDrawerOpen, isDrawerExpanded])

	useEffect(() => {
		const layout = selectedProviderId ? tabLayouts[selectedProviderId] : null
		if (!layout) {
			return
		}
		const { x, width } = layout
		if (!indicatorReady.current) {
			indicatorX.setValue(x)
			indicatorWidth.setValue(width)
			indicatorReady.current = true
			return
		}
		Animated.parallel([
			Animated.timing(indicatorX, {
				toValue: x,
				duration: 240,
				useNativeDriver: false,
			}),
			Animated.timing(indicatorWidth, {
				toValue: width,
				duration: 240,
				useNativeDriver: false,
			}),
		]).start()
	}, [indicatorWidth, indicatorX, selectedProviderId, tabLayouts])

	useEffect(() => {
		refreshProviders().catch(() => {})
	}, [refreshProviders])

	useEffect(() => {
		setSections(selectedProvider?.sections ?? [])
		setSectionItems({})
		setSectionPages({})
		setSectionLoading({})
		setSectionHasMore({})
	}, [selectedProvider])

	useEffect(() => {
		const providerId = selectedProviderId
		if (!providerId) {
			return
		}
		const provider = providersMap[providerId]
		if (!provider) {
			return
		}
		setLoading(true)
		setError(null)
		const loadSections = async () => {
			const baseSections = await provider.getDiscoverSections()
			const normalizedSections = baseSections.some((section) => section.id === "genres")
				? baseSections
				: [{ id: "genres", title: "Genres", items: [] }, ...baseSections]
			setSections(normalizedSections)
			const [genreItems, ...sectionResults] = await Promise.all([
				provider.getDiscoverGenres(),
				...normalizedSections
					.filter((section) => section.id !== "genres")
					.map(async (section) => {
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
			sectionResults.forEach((result) => {
				initialItems[result.id] = result.items
				initialPages[result.id] = 1
				initialHasMore[result.id] = result.items.length >= PAGE_SIZE
			})
			setSectionItems(initialItems)
			setSectionPages(initialPages)
			setSectionHasMore(initialHasMore)
		}
		loadSections()
			.catch((err) =>
				setError(err instanceof Error ? err.message : "Failed to load discover sections")
			)
			.finally(() => setLoading(false))
	}, [providersMap, selectedProviderId])

	const handleOpenProvider = async () => {
		const providerId = selectedProviderId
		if (!providerId) {
			return
		}
		const provider = providersMap[providerId]
		const url = provider?.meta.baseUrl || ""
		if (!url) {
			return
		}
		await WebBrowser.openBrowserAsync(url)
	}

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
			const nextItems = (sectionItems.genres ?? []).slice(sliceStart, sliceEnd)
			setSectionItems((current) => ({
				...current,
				[sectionId]: [...(current[sectionId] ?? []), ...nextItems],
			}))
			setSectionPages((current) => ({ ...current, [sectionId]: nextPage }))
			setSectionHasMore((current) => ({
				...current,
				[sectionId]: sliceEnd < (sectionItems.genres ?? []).length,
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

	const renderSectionHeader = (section: ProviderDiscoverSection, title: string) => (
		<View className="flex-row items-center justify-between">
			<Text className="text-lg font-semibold text-foreground">{title}</Text>
			<Link
				href={{
					pathname: "/discover/[sectionId]",
					params: {
						sectionId: section.id,
						provider: selectedProviderId,
						title,
					},
				}}
				className="h-10 w-10 items-center justify-center rounded-[14px] bg-accent/20"
			>
				<Text className="text-sm text-accent">↗</Text>
			</Link>
		</View>
	)

	const handleHorizontalScroll = (sectionId: string) => (event: {
		nativeEvent: {
			layoutMeasurement: { width: number }
			contentOffset: { x: number }
			contentSize: { width: number }
		}
	}) => {
		const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
		const threshold = 120
		if (layoutMeasurement.width + contentOffset.x >= contentSize.width - threshold) {
			loadMore(sectionId)
		}
	}

	const handleToggleDrawerHeight = () => {
		if (!errorDrawerOpen) {
			setErrorDrawerOpen(true)
			setIsDrawerExpanded(false)
			return
		}
		setIsDrawerExpanded((current) => !current)
	}

	useEffect(() => {
		if (!errorDrawerOpen) {
			return
		}
		Animated.timing(errorDrawerHeight, {
			toValue: isDrawerExpanded ? errorDrawerMaxHeight : errorDrawerBaseHeight,
			duration: 200,
			useNativeDriver: false,
		}).start()
	}, [errorDrawerBaseHeight, errorDrawerHeight, errorDrawerMaxHeight, errorDrawerOpen, isDrawerExpanded])

	const handleCloseDrawer = () => {
		setErrorDrawerOpen(false)
		setIsDrawerExpanded(false)
	}

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-12"
			>
				<View className="pt-4">
					<View className="relative items-center justify-center">
						<Text className="text-base font-semibold text-foreground">Discover</Text>
						<Pressable
							onPress={handleOpenProvider}
							className="absolute right-0 h-8 w-8 items-center justify-center rounded-full border border-border bg-card"
						>
							<Text className="text-sm text-accent">☁</Text>
						</Pressable>
					</View>
					<View className="mt-4">
					<View className="relative -mx-4 px-4">
							<View className="absolute bottom-0 left-0 right-0 h-[2px] bg-border" />
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								className="pb-3"
								contentContainerClassName="flex-row gap-6"
							>
								<View className="relative flex-row gap-6">
									<Animated.View
										style={{
											transform: [{ translateX: indicatorX }],
											width: indicatorWidth,
										}}
										className="absolute bottom-0 h-[4px] rounded-full bg-accent"
									/>
									{hasProviders ? (
										providers.map((provider) => {
											const active = provider.id === selectedProviderId
											return (
												<Pressable
													key={provider.id}
													onPress={() => setSelectedProvider(provider.id)}
													onLayout={(event) => {
														const { x, width } = event.nativeEvent.layout
														setTabLayouts((current) => ({
															...current,
															[provider.id]: { x, width },
														}))
													}}
													className="pb-3 px-4"
												>
													<Text
														className={`text-sm font-semibold ${
															active ? "text-accent" : "text-muted"
														}`}
													>
														{provider.name}
													</Text>
												</Pressable>
											)
										})
									) : (
										<View className="rounded-full border border-border px-4 py-2">
											<Text className="text-xs uppercase tracking-[0.2em] text-muted">
												No providers
											</Text>
										</View>
									)}
								</View>
							</ScrollView>
						</View>
					</View>
				</View>
				{heroItems.length > 0 ? (
					<View className="mt-6">
						<Animated.ScrollView
							ref={heroScrollRef}
							horizontal
							snapToInterval={heroWidth + heroSpacing}
							decelerationRate="fast"
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ paddingRight: heroSpacing }}
							onScroll={Animated.event(
								[{ nativeEvent: { contentOffset: { x: heroScrollX } } }],
								{ useNativeDriver: false }
							)}
							scrollEventThrottle={16}
						>
							{heroItems.map((item) => {
								const isItemFavorite = favoriteStore.contains(
									item.id,
									selectedProviderId ?? ""
								)
								return (
									<View
										key={item.id}
										style={{ width: heroWidth, marginRight: heroSpacing }}
										className="overflow-hidden rounded-[26px] bg-card"
									>
										<View className="relative">
											<Link
												href={{
													pathname: "/manga/[id]",
													params: { id: item.id, provider: selectedProviderId },
												}}
												asChild
											>
												<Pressable>
													{item.coverUrl ? (
														<Image
															source={{ uri: item.coverUrl }}
															className="h-56 w-full"
															resizeMode="cover"
														/>
													) : (
														<View className="h-56 w-full bg-card" />
													)}
													<View className="absolute inset-0 bg-black/40" />
													<View className="absolute inset-x-0 bottom-0 p-4 pb-14">
														<Text
															className="text-lg font-semibold text-white"
															numberOfLines={1}
														>
															{item.title}
														</Text>
														<Text
															className="mt-1 text-xs text-white/70"
															numberOfLines={2}
														>
															{getHeroSubtitle(item)}
														</Text>
														<Text className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
															{heroProvider}
														</Text>
													</View>
												</Pressable>
											</Link>
						<View className="absolute inset-x-0 bottom-3 px-4" pointerEvents="box-none">
							<View className="flex-row gap-3">
								<Pressable
									onPress={() => {
										if (!selectedProviderId) {
											return
										}
										if (isItemFavorite) {
											favoriteStore.remove(item.id, selectedProviderId)
											return
										}
										favoriteStore.add(item, selectedProviderId)
									}}
									className="flex-1 rounded-full bg-black/75 px-4 py-3"
								>
									<Text className="text-center text-sm font-semibold text-accent">
										{isItemFavorite ? "In Library" : "Add to Library"}
									</Text>
								</Pressable>
								<Link
									href={{
										pathname: "/manga/[id]",
										params: { id: item.id, provider: selectedProviderId },
									}}
									className="flex-1 rounded-full bg-black/75 px-4 py-3"
								>
									<Text className="text-center text-sm font-semibold text-accent">
										Read Now
									</Text>
								</Link>
							</View>
						</View>
										</View>
									</View>
								)
							})}
						</Animated.ScrollView>
					</View>
				) : null}
				{loading ? (
					<View className="mt-6 items-center justify-center rounded-[22px] bg-card p-6">
						<ActivityIndicator color="#ff6b6b" />
						<Text className="mt-3 text-sm text-muted">Loading providers…</Text>
					</View>
				) : error ? (
					<View className="mt-6 rounded-[22px] bg-card p-6">
						<Text className="text-base font-semibold text-foreground">Something went wrong</Text>
						<Text className="mt-2 text-sm text-muted">{error}</Text>
					</View>
				) : !hasProviders ? (
					<View className="mt-6 rounded-[22px] bg-card p-6">
						<Text className="text-lg font-semibold text-foreground">
							No extensions installed
						</Text>
						<Text className="mt-2 text-sm text-muted">
							Install an extension to unlock discover sections and filters.
						</Text>
						<Link
							href="/settings/extensions"
							className="mt-4 rounded-full bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-foreground"
						>
							Go to Extensions
						</Link>
					</View>
				) : (
					<View className="mt-6 gap-6">
						{orderedSections.map((section) => {
							const items = sectionItems[section.id] ?? []
							if (section.id === "genres") {
								const genreItems = sectionItems.genres ?? []
								const genreTitle = section.title || "Genres"
								return (
									<View key={section.id}>
										{renderSectionHeader(section, genreTitle)}
										<ScrollView
											horizontal
											showsHorizontalScrollIndicator={false}
											className="mt-4"
											scrollEventThrottle={120}
											onScroll={handleHorizontalScroll(section.id)}
										>
											<View className="flex-row gap-3">
												{genreItems.map((item, index) => {
													const color = genreColors[index % genreColors.length]
													return (
														<Link
															key={item.id}
															href={{
														pathname: "/discover/[sectionId]",
														params: {
															sectionId: item.id,
															provider: selectedProviderId,
															title: item.title,
														},
													}}
															asChild
														>
															<Pressable
																style={{ backgroundColor: color }}
																className="h-[72px] w-[140px] overflow-hidden rounded-[18px] px-4 py-3"
															>
																<View className="absolute right-0 top-0 h-12 w-12 rounded-bl-[24px] bg-white/30" />
																<View className="absolute right-3 top-2 h-7 w-7 items-center justify-center rounded-full bg-white/40">
																	<Text className="text-xs font-semibold text-white">→</Text>
																</View>
																<Text className="text-sm font-semibold text-white" numberOfLines={2}>
																	{item.title}
																</Text>
															</Pressable>
														</Link>
													)
												})}
										</View>
									</ScrollView>
								</View>
							)
							}
							return (
								<View key={section.id}>
									{renderSectionHeader(section, section.title)}
									<ScrollView
										horizontal
										showsHorizontalScrollIndicator={false}
										className="mt-4"
										scrollEventThrottle={120}
										onScroll={handleHorizontalScroll(section.id)}
									>
										<View className="flex-row gap-4">
											{items.map((item) => (
												<Link
													key={item.id}
													href={{
														pathname: "/manga/[id]",
														params: { id: item.id, provider: selectedProviderId },
													}}
													asChild
												>
													<Pressable className="w-[150px]">
														<MangaCard
															title={item.title}
															subtitle={item.subtitle}
															coverUrl={item.coverUrl}
														/>
													</Pressable>
												</Link>
											))}
										</View>
									</ScrollView>
								</View>
							)
						})}
					</View>
				)}
			</ScrollView>
			{showProviderErrors && providerLoadError ? (
				<View className="absolute inset-0" pointerEvents="box-none">
					<View className="flex-1" pointerEvents="box-none" />
					<Animated.View
						style={{ height: errorDrawerHeight }}
						className="overflow-hidden rounded-t-[28px] border border-border bg-card shadow-2xl"
					>
						<View className="items-center justify-center">
							<Pressable
								onPress={handleToggleDrawerHeight}
								className="h-[28px] w-full items-center justify-center"
							>
								<View className="h-1.5 w-12 rounded-full bg-border" />
							</Pressable>
						</View>
						<View className="px-5 pb-6 pt-2">
							<View className="flex-row items-center justify-between">
								<Text className="text-base font-semibold text-foreground">
									Provider error
								</Text>
								<Pressable
									onPress={handleCloseDrawer}
									className="h-8 w-8 items-center justify-center rounded-full border border-border bg-background"
								>
									<Text className="text-sm text-muted">×</Text>
								</Pressable>
							</View>
							<Text className="mt-2 text-sm text-muted">
								The selected provider failed to load. Update the extension bundle.
							</Text>
							<View className="mt-4 rounded-[18px] border border-amber-500/40 bg-amber-500/10 px-4 py-3">
								<Text className="text-sm text-amber-100">{providerLoadError}</Text>
							</View>
						</View>
					</Animated.View>
				</View>
			) : null}
		</View>
	)
}
