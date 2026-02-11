import * as ScreenOrientation from "expo-screen-orientation"
import { Ionicons } from "@expo/vector-icons"
import { Link, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useEffect, useMemo, useRef, useState } from "react"
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native"

import { useExtensionsStore } from "@stores/extensions"
import { useHistoryStore } from "@stores/history"
import { useSettingsStore } from "@stores/settings"
import type { ProviderPage } from "../../types/provider"

export default function ReaderScreen() {
	const params = useLocalSearchParams<{
		chapterId: string
		provider?: string
		chapterTitle?: string
		mangaTitle?: string
		mangaId?: string
	}>()
	const chapterId = params.chapterId
	const provider = params.provider
	const providers = useExtensionsStore((state) => state.providers)
	const readerMode = useSettingsStore((state) => state.readerMode)
	const tapZonePreset = useSettingsStore((state) => state.tapZonePreset)
	const swipeEnabled = useSettingsStore((state) => state.swipeEnabled)
	const tapNavigationEnabled = useSettingsStore((state) => state.tapNavigationEnabled)
	const autoHideChrome = useSettingsStore((state) => state.autoHideChrome)
	const fitMode = useSettingsStore((state) => state.fitMode)
	const background = useSettingsStore((state) => state.background)
	const lockRotation = useSettingsStore((state) => state.lockRotation)
	const setReaderMode = useSettingsStore((state) => state.setReaderMode)
	const setFitMode = useSettingsStore((state) => state.setFitMode)
	const setBackground = useSettingsStore((state) => state.setBackground)
	const setSwipeEnabled = useSettingsStore((state) => state.setSwipeEnabled)
	const setTapNavigationEnabled = useSettingsStore((state) => state.setTapNavigationEnabled)
	const setAutoHideChrome = useSettingsStore((state) => state.setAutoHideChrome)
	const setLockRotation = useSettingsStore((state) => state.setLockRotation)
	const [pages, setPages] = useState<ProviderPage[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [chromeVisible, setChromeVisible] = useState(true)
	const [currentIndex, setCurrentIndex] = useState(0)
	const [tapWidth, setTapWidth] = useState(0)
	const [swipeStartX, setSwipeStartX] = useState<number | null>(null)
	const [showSettings, setShowSettings] = useState(false)
	const [contentWidth, setContentWidth] = useState(0)
	const [pageRatios, setPageRatios] = useState<Record<string, number>>({})
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const providerId = provider ?? ""
	const addHistory = useHistoryStore((state) => state.addEntry)
	const pageSequence = useMemo(() => {
		if (readerMode === "rtl") {
			return [...pages].reverse()
		}
		return pages
	}, [pages, readerMode])
	const isDoubleMode = readerMode === "double"
	const spreadSequence = useMemo(() => {
		if (!isDoubleMode) {
			return [] as ProviderPage[][]
		}
		const spreads: ProviderPage[][] = []
		for (let index = 0; index < pageSequence.length; index += 2) {
			spreads.push(pageSequence.slice(index, index + 2))
		}
		return spreads
	}, [isDoubleMode, pageSequence])
	const totalPages = isDoubleMode ? spreadSequence.length : pageSequence.length
	const clampedIndex = Math.min(currentIndex, Math.max(totalPages - 1, 0))
	const currentPage = pageSequence[clampedIndex]
	const currentSpread = isDoubleMode ? spreadSequence[clampedIndex] : undefined
	const isPagedMode = readerMode === "ltr" || readerMode === "rtl" || readerMode === "double"
	const pageLabel = isDoubleMode
		? `${Math.min(clampedIndex * 2 + 1, pageSequence.length)}-${Math.min(
				clampedIndex * 2 + 2,
				pageSequence.length
			)}/${pageSequence.length}`
		: `${clampedIndex + 1}/${totalPages || 0}`
	const pageDisplay = pageLabel.includes("/") ? pageLabel.replace("/", " of ") : pageLabel
	const insets = useSafeAreaInsets()
	const tapZones = useMemo(() => {
		switch (tapZonePreset) {
			case "wide-center":
				return { left: 0.2, center: 0.6, right: 0.2 }
			case "classic":
				return { left: 0.3, center: 0.4, right: 0.3 }
			default:
				return { left: 0.33, center: 0.34, right: 0.33 }
		}
	}, [tapZonePreset])
	const fitModeValue = fitMode === "cover" ? "cover" : fitMode === "width" ? "cover" : "contain"
	const backgroundClassName =
		background === "graphite"
			? "bg-neutral-900"
			: background === "parchment"
				? "bg-[#1b1712]"
				: "bg-background"
	const orderedPages = pageSequence

	const handlePrev = () => {
		if (totalPages === 0) {
			return
		}
		setCurrentIndex((index) => Math.max(index - 1, 0))
	}

	const handleNext = () => {
		if (totalPages === 0) {
			return
		}
		setCurrentIndex((index) => Math.min(index + 1, totalPages - 1))
	}

	const handleTapZone = (x: number) => {
			if (!isPagedMode) {
				if (!showSettings) {
					setChromeVisible((value) => !value)
				}
				return
			}
			if (!tapNavigationEnabled) {
				if (!showSettings) {
					setChromeVisible((value) => !value)
				}
				return
			}
		const width = tapWidth || 1
		const leftEdge = width * tapZones.left
		const rightEdge = width * (1 - tapZones.right)
		const isRtl = readerMode === "rtl"
		if (x < leftEdge) {
			isRtl ? handleNext() : handlePrev()
			return
		}
		if (x > rightEdge) {
			isRtl ? handlePrev() : handleNext()
			return
		}
		if (!showSettings) {
			setChromeVisible((value) => !value)
		}
	}

	const handleSwipe = (direction: "left" | "right") => {
		if (!swipeEnabled || !isPagedMode) {
			return
		}
		const isRtl = readerMode === "rtl"
		if (direction === "left") {
			isRtl ? handlePrev() : handleNext()
			return
		}
		isRtl ? handleNext() : handlePrev()
	}

	useEffect(() => {
		const providerInstance = providers[providerId]
		if (!providerInstance || !chapterId) {
			setError("Provider not available")
			setLoading(false)
			return
		}
		setLoading(true)
		setError(null)
		providerInstance
			.getChapterPages(chapterId)
			.then((data) => {
				setPages(data)
				setCurrentIndex(0)
				setPageRatios({})
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false))
	}, [chapterId, providerId, providers])

	useEffect(() => {
		if (!currentPage || !chapterId || totalPages === 0) {
			return
		}
		addHistory({
			id: `${providerId}-${chapterId}-${clampedIndex}`,
			title:
				typeof params.mangaTitle === "string" && params.mangaTitle.length > 0
					? params.mangaTitle
					: `Chapter ${chapterId}`,
			chapter:
				typeof params.chapterTitle === "string" && params.chapterTitle.length > 0
					? params.chapterTitle
					: chapterId,
			page: clampedIndex + 1,
			readAt: Date.now(),
			readAtLabel: "Just now",
		})
	}, [
		addHistory,
		chapterId,
		clampedIndex,
		currentPage,
		params.chapterTitle,
		params.mangaTitle,
		providerId,
		totalPages,
	])

	useEffect(() => {
		if (!autoHideChrome || !chromeVisible || showSettings) {
			return
		}
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current)
		}
		hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3000)
		return () => {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current)
			}
		}
	}, [autoHideChrome, chromeVisible, clampedIndex, showSettings])

	useEffect(() => {
		if (!lockRotation) {
			ScreenOrientation.unlockAsync().catch(() => {})
			return
		}
		ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {})
		return () => {
			ScreenOrientation.unlockAsync().catch(() => {})
		}
	}, [lockRotation])

	const handleSettingsToggle = () => {
		setShowSettings((value) => !value)
		setChromeVisible(true)
	}


	const handleImageLoad =
		(url: string) => (event: { nativeEvent: { source?: { width?: number; height?: number } } }) => {
			const width = event.nativeEvent.source?.width
			const height = event.nativeEvent.source?.height
			if (!width || !height) {
				return
			}
			const ratio = height / width
			setPageRatios((current) => {
				if (current[url]) {
					return current
				}
				return { ...current, [url]: ratio }
			})
		}

	const readerTitle =
		typeof params.mangaTitle === "string" && params.mangaTitle.length > 0
			? params.mangaTitle
			: "Reader"
	const readerSubtitle =
		typeof params.chapterTitle === "string" && params.chapterTitle.length > 0
			? params.chapterTitle
			: `Chapter ${chapterId ?? ""}`
	const infoMangaId = typeof params.mangaId === "string" ? params.mangaId : ""

	return (
		<View className={`flex-1 ${backgroundClassName}`}>
			<View className="flex-1">
				{chromeVisible ? (
					<View className="px-5" style={{ paddingTop: 24 + insets.top }}>
						<View className="rounded-[18px] bg-card px-4 py-3">
							<View className="flex-row items-center justify-between">
								<View className="flex-1 pr-4">
									<Text className="text-base font-semibold text-foreground" numberOfLines={1}>
										{readerTitle}
									</Text>
									<Text className="text-xs text-muted" numberOfLines={1}>
										{readerSubtitle}
									</Text>
								</View>
								<Pressable
									onPress={() => setChromeVisible(false)}
									className="h-9 w-9 items-center justify-center rounded-full bg-chip"
								>
									<Ionicons name="close" size={18} color="#f5f5f5" />
								</Pressable>
							</View>
						</View>
						<View className="mt-3">
							<Link
								href={{
									pathname: "/manga/[id]",
									params: { id: infoMangaId, provider: providerId },
								}}
								asChild
							>
								<Pressable
									onPress={() => {
										if (!infoMangaId) {
											return
										}
										setChromeVisible(false)
									}}
									className={`h-10 w-10 items-center justify-center rounded-full bg-chip ${
										infoMangaId ? "" : "opacity-40"
									}`}
								>
									<Ionicons name="information" size={18} color="#f5f5f5" />
								</Pressable>
							</Link>
						</View>
					</View>
				) : null}
				{loading ? (
					<View className="items-center justify-center rounded-[28px] border border-white/5 bg-neutral-900/70 p-6">
						<ActivityIndicator color="#ff9900" />
						<Text className="mt-3 text-sm text-neutral-400">Loading pages…</Text>
					</View>
				) : error ? (
					<View className="rounded-[28px] border border-amber-500/40 bg-amber-500/10 p-6">
						<Text className="text-base font-semibold text-amber-100">Unable to load</Text>
						<Text className="mt-2 text-sm text-amber-100/80">{error}</Text>
					</View>
				) : pages.length === 0 ? (
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-6">
						<Text className="text-base font-semibold text-white">No pages yet</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							This chapter has no pages available.
						</Text>
					</View>
				) : isPagedMode ? (
					<View className="flex-1">
						<Pressable
							className="flex-1"
							onLayout={(event) => setTapWidth(event.nativeEvent.layout.width)}
							onPress={(event) => handleTapZone(event.nativeEvent.locationX)}
							onTouchStart={(event) => {
								if (!swipeEnabled) {
									return
								}
								setSwipeStartX(event.nativeEvent.pageX)
							}}
							onTouchEnd={(event) => {
								if (!swipeEnabled || swipeStartX === null) {
									return
								}
								const delta = event.nativeEvent.pageX - swipeStartX
								if (Math.abs(delta) > 40) {
									handleSwipe(delta < 0 ? "left" : "right")
								}
								setSwipeStartX(null)
							}}
							onTouchMove={() => {
								if (chromeVisible) {
									setChromeVisible(false)
								}
							}}
						>
							{isDoubleMode ? (
								<View className="h-full w-full flex-row">
									{currentSpread?.map((page, index) => (
										<Image
											key={`${page.url}-${index}`}
											source={{ uri: page.url, headers: page.headers }}
											className="h-full flex-1"
											resizeMode={fitModeValue}
										/>
									))}
								</View>
							) : currentPage ? (
								<Image
									source={{ uri: currentPage.url, headers: currentPage.headers }}
									className="h-full w-full"
									resizeMode={fitModeValue}
								/>
							) : null}
						</Pressable>
					</View>
				) : (
					<ScrollView
						className="flex-1 px-5"
						contentInsetAdjustmentBehavior="automatic"
						onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
						onScrollBeginDrag={() => setChromeVisible(false)}
						scrollEventThrottle={16}
					>
						<View className="gap-4 pb-12">
							{orderedPages.map((page) => (
								<Pressable
									key={page.url}
									onPress={() => {
										if (!showSettings) {
											setChromeVisible((value) => !value)
										}
									}}
								>
									<Image
										source={{ uri: page.url, headers: page.headers }}
										className="w-full rounded-[26px] bg-neutral-900"
										style={{
											height:
												pageRatios[page.url] && contentWidth
													? Math.round(contentWidth * pageRatios[page.url])
													: 260,
										}}
										resizeMode={fitModeValue}
										onLoad={handleImageLoad(page.url)}
									/>
								</Pressable>
							))}
						</View>
					</ScrollView>
				)}
				{chromeVisible && !showSettings ? (
					<View
						className="absolute inset-x-0 px-5"
						style={{ bottom: Math.max(insets.bottom, 10), paddingBottom: 12 }}
					>
						<View className="flex-row items-center justify-between rounded-[24px] bg-card px-4 py-3">
							<Pressable
								onPress={() => {
									setReaderMode(readerMode === "rtl" ? "ltr" : "rtl")
								}}
								className="h-11 w-11 items-center justify-center rounded-full bg-chip"
							>
								<Ionicons name="swap-horizontal" size={18} color="#f5f5f5" />
							</Pressable>
							<Pressable
								onPress={() => setLockRotation(!lockRotation)}
								className="h-11 w-11 items-center justify-center rounded-full bg-chip"
							>
								<Ionicons name="lock-closed" size={18} color="#f5f5f5" />
							</Pressable>
							<Pressable
								onPress={handleSettingsToggle}
								className="h-11 w-11 items-center justify-center rounded-full bg-chip"
							>
								<Ionicons name="settings-sharp" size={18} color="#f5f5f5" />
							</Pressable>
							<View className="flex-row items-center gap-3">
								<Pressable
									onPress={handlePrev}
									className="h-11 w-11 items-center justify-center rounded-full bg-chip"
								>
									<Ionicons name="chevron-back" size={18} color="#f5f5f5" />
								</Pressable>
								<Text className="text-xs uppercase tracking-[0.2em] text-foreground">
									{pageDisplay}
								</Text>
								<Pressable
									onPress={handleNext}
									className="h-11 w-11 items-center justify-center rounded-full bg-chip"
								>
									<Ionicons name="chevron-forward" size={18} color="#f5f5f5" />
								</Pressable>
							</View>
						</View>
					</View>
				) : null}
				{showSettings ? (
					<View className="absolute inset-0 justify-end bg-black/60">
						<Pressable className="flex-1" onPress={() => setShowSettings(false)} />
						<View className="rounded-t-[32px] border border-white/10 bg-neutral-950 px-5 pb-8 pt-6">
							<View className="flex-row items-center justify-between">
								<Text className="text-lg font-semibold text-white">Reader Settings</Text>
								<Text
									className="text-sm font-semibold text-amber-400"
									onPress={() => setShowSettings(false)}
								>
									Done
								</Text>
							</View>
							<View className="mt-6">
								<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
									Reader type
								</Text>
								<View className="mt-3 flex-row overflow-hidden rounded-full border border-white/10 bg-neutral-900">
									<Text
										className={`flex-1 px-4 py-2 text-center text-sm font-semibold ${
											readerMode === "webtoon"
												? "bg-neutral-800 text-white"
												: "text-neutral-400"
										}`}
										onPress={() => setReaderMode("webtoon")}
									>
										Vertical
									</Text>
									<Text
										className={`flex-1 px-4 py-2 text-center text-sm font-semibold ${
											readerMode === "ltr" || readerMode === "rtl" || readerMode === "double"
												? "bg-neutral-800 text-white"
												: "text-neutral-400"
										}`}
										onPress={() => setReaderMode("ltr")}
									>
										Horizontal
									</Text>
								</View>
							</View>
							<View className="mt-6">
								<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
									Reader direction
								</Text>
								<View className="mt-3 gap-3">
									{(
										[
											{ id: "ltr", label: "Left to right" },
											{ id: "rtl", label: "Right to left" },
											{ id: "double", label: "Double page" },
										] as const
									).map((mode) => (
										<Text
											key={mode.id}
											className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
												readerMode === mode.id
													? "border-amber-400/80 bg-amber-500/15 text-amber-100"
													: "border-white/5 bg-neutral-900/70 text-neutral-300"
											}`}
											onPress={() => setReaderMode(mode.id)}
										>
											{mode.label}
										</Text>
									))}
								</View>
							</View>
							<View className="mt-6">
								<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
									Display
								</Text>
								<View className="mt-3 gap-3">
									{(
										[
											{ id: "contain", label: "Fit screen" },
											{ id: "cover", label: "Fill screen" },
											{ id: "width", label: "Fit width" },
										] as const
									).map((mode) => (
										<Text
											key={mode.id}
											className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
												fitMode === mode.id
													? "border-amber-400/80 bg-amber-500/15 text-amber-100"
													: "border-white/5 bg-neutral-900/70 text-neutral-300"
											}`}
											onPress={() => setFitMode(mode.id)}
										>
											{mode.label}
										</Text>
									))}
								</View>
							</View>
							<View className="mt-6">
								<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
									Background
								</Text>
								<View className="mt-3 gap-3">
									{(
										[
											{ id: "ink", label: "Ink" },
											{ id: "graphite", label: "Graphite" },
											{ id: "parchment", label: "Parchment" },
										] as const
									).map((tone) => (
										<Text
											key={tone.id}
											className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
												background === tone.id
													? "border-amber-400/80 bg-amber-500/15 text-amber-100"
													: "border-white/5 bg-neutral-900/70 text-neutral-300"
											}`}
											onPress={() => setBackground(tone.id)}
										>
											{tone.label}
										</Text>
									))}
								</View>
							</View>
							<View className="mt-6 gap-4">
								<View className="flex-row items-center justify-between rounded-[20px] border border-white/10 bg-neutral-900/80 px-4 py-3">
									<Text className="text-sm font-semibold text-white">Tap navigation</Text>
									<Pressable
										onPress={() => setTapNavigationEnabled(!tapNavigationEnabled)}
										className={`h-6 w-12 rounded-full ${
											tapNavigationEnabled ? "bg-emerald-400" : "bg-neutral-700"
										}`}
									>
										<View
											className={`h-6 w-6 rounded-full bg-white ${
												tapNavigationEnabled ? "ml-6" : "ml-0"
											}`}
										/>
									</Pressable>
								</View>
								<View className="flex-row items-center justify-between rounded-[20px] border border-white/10 bg-neutral-900/80 px-4 py-3">
									<Text className="text-sm font-semibold text-white">Auto-hide controls</Text>
									<Pressable
										onPress={() => setAutoHideChrome(!autoHideChrome)}
										className={`h-6 w-12 rounded-full ${
											autoHideChrome ? "bg-emerald-400" : "bg-neutral-700"
										}`}
									>
										<View
											className={`h-6 w-6 rounded-full bg-white ${
												autoHideChrome ? "ml-6" : "ml-0"
											}`}
										/>
									</Pressable>
								</View>
								<View className="flex-row items-center justify-between rounded-[20px] border border-white/10 bg-neutral-900/80 px-4 py-3">
									<Text className="text-sm font-semibold text-white">Swipe navigation</Text>
									<Pressable
										onPress={() => setSwipeEnabled(!swipeEnabled)}
										className={`h-6 w-12 rounded-full ${
											swipeEnabled ? "bg-emerald-400" : "bg-neutral-700"
										}`}
									>
										<View
											className={`h-6 w-6 rounded-full bg-white ${
												swipeEnabled ? "ml-6" : "ml-0"
											}`}
										/>
									</Pressable>
								</View>
								<View className="flex-row items-center justify-between rounded-[20px] border border-white/10 bg-neutral-900/80 px-4 py-3">
									<Text className="text-sm font-semibold text-white">Lock rotation</Text>
									<Pressable
										onPress={() => setLockRotation(!lockRotation)}
										className={`h-6 w-12 rounded-full ${
											lockRotation ? "bg-emerald-400" : "bg-neutral-700"
										}`}
									>
										<View
											className={`h-6 w-6 rounded-full bg-white ${
												lockRotation ? "ml-6" : "ml-0"
											}`}
										/>
									</Pressable>
								</View>
							</View>
						</View>
					</View>
				) : null}
			</View>
		</View>
	)
}
