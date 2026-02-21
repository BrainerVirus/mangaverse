import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomChromeOverlay } from '@components/reader/BottomChromeOverlay';
import { SettingsDrawer } from '@components/reader/SettingsDrawer';
import { TopChromeOverlay } from '@components/reader/TopChromeOverlay';
import { useThemeColors } from '@lib/themes/vars';
import { useHistoryStore } from '@stores/history';
import { useSettingsStore } from '@stores/settings';
import { useReaderChrome } from '../../hooks/useReaderChrome';
import { useReaderData } from '../../hooks/useReaderData';
import type { ProviderChapter } from '../../types/provider';

export default function ReaderScreen() {
	const params = useLocalSearchParams<{
		chapterId: string;
		provider?: string;
		chapterTitle?: string;
		mangaTitle?: string;
		mangaId?: string;
	}>();
	const chapterId = params.chapterId;
	const providerId = params.provider ?? '';
	const router = useRouter();
	const { width: screenWidth } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const themeColors = useThemeColors();

	// Stores (screen-level only)
	const readerMode = useSettingsStore((s) => s.readerMode);
	const readerDirection = useSettingsStore((s) => s.readerDirection);
	const tapZonePreset = useSettingsStore((s) => s.tapZonePreset);
	const swipeEnabled = useSettingsStore((s) => s.swipeEnabled);
	const tapNavigationEnabled = useSettingsStore((s) => s.tapNavigationEnabled);
	const autoHideChrome = useSettingsStore((s) => s.autoHideChrome);
	const lockRotation = useSettingsStore((s) => s.lockRotation);
	const chapterBackground = useSettingsStore((s) => s.chapterBackground);
	const pagePadding = useSettingsStore((s) => s.pagePadding);
	const pillarboxAmount = useSettingsStore((s) => s.pillarboxAmount);
	const chevronButtonLocation = useSettingsStore((s) => s.chevronButtonLocation);
	const settingsButtonLocation = useSettingsStore((s) => s.settingsButtonLocation);
	const setReaderMode = useSettingsStore((s) => s.setReaderMode);
	const setLockRotation = useSettingsStore((s) => s.setLockRotation);
	const addHistory = useHistoryStore((s) => s.addEntry);

	// Derived params
	const infoMangaId = typeof params.mangaId === 'string' ? params.mangaId : '';
	const readerTitle = typeof params.mangaTitle === 'string' && params.mangaTitle.length > 0 ? params.mangaTitle : 'Reader';
	const readerSubtitle =
		typeof params.chapterTitle === 'string' && params.chapterTitle.length > 0 ? params.chapterTitle : `Chapter ${chapterId ?? ''}`;

	// Data
	const { pages, loading, error, nextChapter, prevChapter } = useReaderData({
		chapterId,
		providerId,
		mangaId: infoMangaId,
	});

	// Local state
	const [showSettings, setShowSettings] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [pageRatios, setPageRatios] = useState<Record<string, number>>({});
	const [tapWidth, setTapWidth] = useState(0);
	const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
	const scrollViewRef = useRef<ScrollView>(null);

	// Chrome
	const { chromeVisible, setChromeVisible, chromeOpacity, toggleChrome } = useReaderChrome({
		autoHideChrome,
		showSettings,
		resetTrigger: currentIndex,
	});

	// Derived values
	const isPaged = readerMode === 'paged';
	const isRtl = readerDirection === 'rtl';

	const orderedPages = useMemo(() => {
		if (isPaged && isRtl) return [...pages].reverse();
		return pages;
	}, [pages, isPaged, isRtl]);

	const totalPages = orderedPages.length;
	const clampedIndex = Math.min(currentIndex, Math.max(totalPages - 1, 0));
	const currentPage = orderedPages[clampedIndex];
	const pageDisplay = `${clampedIndex + 1} of ${totalPages || 0}`;

	const bgStyle = useMemo(() => {
		if (chapterBackground === 'black') return { backgroundColor: '#000' };
		if (chapterBackground === 'white') return { backgroundColor: '#fff' };
		return { backgroundColor: themeColors.background };
	}, [chapterBackground, themeColors.background]);

	const tapZones = useMemo(() => {
		switch (tapZonePreset) {
			case 'wide-center':
				return { left: 0.2, right: 0.2 };
			case 'classic':
				return { left: 0.3, right: 0.3 };
			default:
				return { left: 0.33, right: 0.33 };
		}
	}, [tapZonePreset]);

	// Reset local state on chapter change
	useEffect(() => {
		setCurrentIndex(0);
		setPageRatios({});
		setChromeVisible(false);
	}, [chapterId, providerId, setChromeVisible]);

	/* ─── Navigation ─── */
	const scrollToPage = useCallback(
		(pageIdx: number) => {
			if (!scrollViewRef.current || isPaged) return;
			const pillarPx = pillarboxAmount * 8;
			const pad = (pagePadding ? 16 : 0) + pillarPx;
			let y = 0;
			for (let i = 0; i < pageIdx; i++) {
				const ratio = pageRatios[orderedPages[i]?.url] || 1.5;
				y += Math.round((screenWidth - pad * 2) * ratio);
			}
			scrollViewRef.current.scrollTo({ y, animated: true });
		},
		[isPaged, pageRatios, orderedPages, screenWidth, pagePadding, pillarboxAmount],
	);

	const handlePrev = useCallback(() => {
		if (totalPages === 0) return;
		const next = Math.max(currentIndex - 1, 0);
		setCurrentIndex(next);
		if (!isPaged) scrollToPage(next);
	}, [totalPages, currentIndex, isPaged, scrollToPage]);

	const handleNext = useCallback(() => {
		if (totalPages === 0) return;
		const next = Math.min(currentIndex + 1, totalPages - 1);
		setCurrentIndex(next);
		if (!isPaged) scrollToPage(next);
	}, [totalPages, currentIndex, isPaged, scrollToPage]);

	const handleTapZone = useCallback(
		(x: number) => {
			if (!isPaged) {
				toggleChrome();
				return;
			}
			if (!tapNavigationEnabled) {
				toggleChrome();
				return;
			}
			const w = tapWidth || 1;
			const leftEdge = w * tapZones.left;
			const rightEdge = w * (1 - tapZones.right);
			if (x < leftEdge) {
				isRtl ? handleNext() : handlePrev();
				return;
			}
			if (x > rightEdge) {
				isRtl ? handlePrev() : handleNext();
				return;
			}
			toggleChrome();
		},
		[isPaged, tapNavigationEnabled, tapWidth, tapZones, isRtl, handleNext, handlePrev, toggleChrome],
	);

	const navigateToChapter = useCallback(
		(chapter: ProviderChapter) => {
			router.replace({
				pathname: '/reader/[chapterId]',
				params: {
					chapterId: chapter.id,
					provider: providerId,
					mangaId: infoMangaId,
					chapterTitle: chapter.title,
					mangaTitle: params.mangaTitle ?? '',
				},
			});
		},
		[router, providerId, infoMangaId, params.mangaTitle],
	);

	/* ─── Effects ─── */
	// History tracking
	useEffect(() => {
		if (!currentPage || !chapterId || totalPages === 0) return;
		addHistory({
			id: `${providerId}-${infoMangaId || chapterId}`,
			title: typeof params.mangaTitle === 'string' && params.mangaTitle.length > 0 ? params.mangaTitle : `Chapter ${chapterId}`,
			chapter: typeof params.chapterTitle === 'string' && params.chapterTitle.length > 0 ? params.chapterTitle : chapterId,
			page: clampedIndex + 1,
			readAt: Date.now(),
			readAtLabel: 'Just now',
		});
	}, [addHistory, chapterId, clampedIndex, currentPage, params.chapterTitle, params.mangaTitle, providerId, totalPages, infoMangaId]);

	// Screen orientation lock
	useEffect(() => {
		if (!lockRotation) {
			ScreenOrientation.unlockAsync().catch(() => {});
			return;
		}
		ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
		return () => {
			ScreenOrientation.unlockAsync().catch(() => {});
		};
	}, [lockRotation]);

	// Image aspect ratio tracking
	const handleImageLoad = (url: string) => (event: { nativeEvent: { source?: { width?: number; height?: number } } }) => {
		const w = event.nativeEvent.source?.width;
		const h = event.nativeEvent.source?.height;
		if (!w || !h) return;
		setPageRatios((current) => {
			if (current[url]) return current;
			return { ...current, [url]: h / w };
		});
	};

	// Vertical scroll page tracking
	const handleVerticalScroll = useCallback(
		(event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
			const { contentOffset, layoutMeasurement } = event.nativeEvent;
			const scrollY = contentOffset.y;
			const pillarPx = pillarboxAmount * 8;
			const pad = (pagePadding ? 16 : 0) + pillarPx;
			const imgW = screenWidth - pad * 2;

			let accHeight = 0;
			for (let i = 0; i < orderedPages.length; i++) {
				const ratio = pageRatios[orderedPages[i].url] || 1.5;
				accHeight += imgW * ratio;
				if (accHeight > scrollY + layoutMeasurement.height / 2) {
					if (i !== currentIndex) setCurrentIndex(i);
					break;
				}
			}
		},
		[orderedPages, pageRatios, screenWidth, currentIndex, pagePadding, pillarboxAmount],
	);

	/* ─── Render ─── */
	const PILLARBOX_UNIT_PX = 8;
	const pillarboxPx = isPaged ? 0 : pillarboxAmount * PILLARBOX_UNIT_PX;
	const paddingH = (pagePadding ? 16 : 0) + pillarboxPx;
	const imageWidth = screenWidth - paddingH * 2;

	return (
		<View className="flex-1" style={bgStyle}>
			{loading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color={themeColors.primary} />
					<Text className="text-preset-1 font-body mt-3" style={{ color: themeColors.muted }}>
						Loading pages…
					</Text>
				</View>
			) : error ? (
				<View className="flex-1 items-center justify-center px-8">
					<Ionicons name="alert-circle-outline" size={48} color={themeColors.warning} />
					<Text className="text-preset-3 font-heading mt-4 text-center font-semibold" style={{ color: themeColors.foreground }}>
						Unable to load
					</Text>
					<Text className="text-preset-2 font-body mt-2 text-center" style={{ color: themeColors.muted }}>
						{error}
					</Text>
					<Pressable onPress={() => router.back()} className="bg-primary mt-6 rounded-xl px-6 py-3">
						<Text className="text-primary-foreground text-preset-2 font-heading font-semibold">Go Back</Text>
					</Pressable>
				</View>
			) : pages.length === 0 ? (
				<View className="flex-1 items-center justify-center px-8">
					<Ionicons name="document-outline" size={48} color={themeColors.muted} />
					<Text className="text-preset-3 font-heading mt-4 font-semibold" style={{ color: themeColors.foreground }}>
						No pages
					</Text>
					<Text className="text-preset-2 font-body mt-2 text-center" style={{ color: themeColors.muted }}>
						This chapter has no pages available.
					</Text>
				</View>
			) : isPaged ? (
				<Pressable
					className="flex-1"
					onLayout={(e) => setTapWidth(e.nativeEvent.layout.width)}
					onPress={(e) => handleTapZone(e.nativeEvent.locationX)}
					onTouchStart={(e) => {
						if (!swipeEnabled) return;
						setSwipeStartX(e.nativeEvent.pageX);
					}}
					onTouchEnd={(e) => {
						if (!swipeEnabled || swipeStartX === null) return;
						const delta = e.nativeEvent.pageX - swipeStartX;
						if (Math.abs(delta) > 40) {
							const dir = delta < 0 ? 'left' : 'right';
							if (dir === 'left') {
								isRtl ? handlePrev() : handleNext();
							} else {
								isRtl ? handleNext() : handlePrev();
							}
						}
						setSwipeStartX(null);
					}}
				>
					{currentPage ? (
						<Image source={{ uri: currentPage.url, headers: currentPage.headers }} className="h-full w-full" resizeMode="contain" />
					) : null}
				</Pressable>
			) : (
				<ScrollView
					ref={scrollViewRef}
					className="flex-1"
					contentInsetAdjustmentBehavior="never"
					onScroll={handleVerticalScroll}
					scrollEventThrottle={100}
					showsVerticalScrollIndicator={false}
				>
					<Pressable onPress={toggleChrome}>
						{orderedPages.map((page) => {
							const ratio = pageRatios[page.url];
							const imgHeight = ratio ? Math.round(imageWidth * ratio) : Math.round(imageWidth * 1.5);
							return (
								<Image
									key={page.url}
									source={{ uri: page.url, headers: page.headers }}
									style={{
										width: imageWidth,
										height: imgHeight,
										marginHorizontal: paddingH,
									}}
									resizeMode="cover"
									onLoad={handleImageLoad(page.url)}
								/>
							);
						})}
					</Pressable>

					<View className="items-center py-8" style={{ paddingHorizontal: 20 }}>
						<Text className="text-preset-1 font-body mb-4" style={{ color: themeColors.muted }}>
							End of {readerSubtitle}
						</Text>
						<View className="w-full flex-row gap-3">
							{prevChapter && (
								<Pressable onPress={() => navigateToChapter(prevChapter)} className="border-border/40 flex-1 items-center rounded-xl border py-3">
									<Text className="text-preset-1 font-body" style={{ color: themeColors.muted }}>
										Previous
									</Text>
									<Text className="text-preset-2 font-heading mt-0.5 font-semibold" style={{ color: themeColors.foreground }} numberOfLines={1}>
										{prevChapter.title}
									</Text>
								</Pressable>
							)}
							{nextChapter && (
								<Pressable onPress={() => navigateToChapter(nextChapter)} className="bg-primary flex-1 items-center rounded-xl py-3">
									<Text className="text-preset-1 font-body text-primary-foreground">Next</Text>
									<Text className="text-preset-2 font-heading text-primary-foreground mt-0.5 font-semibold" numberOfLines={1}>
										{nextChapter.title}
									</Text>
								</Pressable>
							)}
						</View>
					</View>
				</ScrollView>
			)}

			<TopChromeOverlay
				chromeOpacity={chromeOpacity}
				chromeVisible={chromeVisible}
				insets={insets}
				readerTitle={readerTitle}
				readerSubtitle={readerSubtitle}
				infoMangaId={infoMangaId}
				providerId={providerId}
				onClose={() => router.back()}
			/>

			<BottomChromeOverlay
				chromeOpacity={chromeOpacity}
				chromeVisible={chromeVisible}
				insets={insets}
				isPaged={isPaged}
				lockRotation={lockRotation}
				pageDisplay={pageDisplay}
				themeColors={themeColors}
				chevronButtonLocation={chevronButtonLocation}
				settingsButtonLocation={settingsButtonLocation}
				onToggleReaderMode={() => setReaderMode(isPaged ? 'webtoon' : 'paged')}
				onToggleRotation={() => setLockRotation(!lockRotation)}
				onOpenSettings={() => {
					setShowSettings(true);
					setChromeVisible(false);
				}}
				onPrev={handlePrev}
				onNext={handleNext}
			/>

			<SettingsDrawer visible={showSettings} onClose={() => setShowSettings(false)} />
		</View>
	);
}
