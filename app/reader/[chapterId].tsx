import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@lib/themes/vars';
import { useExtensionsStore } from '@stores/extensions';
import { useHistoryStore } from '@stores/history';
import { useSettingsStore } from '@stores/settings';
import type { ProviderPage } from '../../types/provider';

export default function ReaderScreen() {
	const params = useLocalSearchParams<{
		chapterId: string;
		provider?: string;
		chapterTitle?: string;
		mangaTitle?: string;
		mangaId?: string;
	}>();
	const chapterId = params.chapterId;
	const provider = params.provider;
	const providers = useExtensionsStore((state) => state.providers);
	const readerMode = useSettingsStore((state) => state.readerMode);
	const tapZonePreset = useSettingsStore((state) => state.tapZonePreset);
	const swipeEnabled = useSettingsStore((state) => state.swipeEnabled);
	const tapNavigationEnabled = useSettingsStore((state) => state.tapNavigationEnabled);
	const autoHideChrome = useSettingsStore((state) => state.autoHideChrome);
	const fitMode = useSettingsStore((state) => state.fitMode);
	const background = useSettingsStore((state) => state.background);
	const lockRotation = useSettingsStore((state) => state.lockRotation);
	const setReaderMode = useSettingsStore((state) => state.setReaderMode);
	const setFitMode = useSettingsStore((state) => state.setFitMode);
	const setBackground = useSettingsStore((state) => state.setBackground);
	const setSwipeEnabled = useSettingsStore((state) => state.setSwipeEnabled);
	const setTapNavigationEnabled = useSettingsStore((state) => state.setTapNavigationEnabled);
	const setAutoHideChrome = useSettingsStore((state) => state.setAutoHideChrome);
	const setLockRotation = useSettingsStore((state) => state.setLockRotation);
	const [pages, setPages] = useState<ProviderPage[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [chromeVisible, setChromeVisible] = useState(true);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [tapWidth, setTapWidth] = useState(0);
	const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const [contentWidth, setContentWidth] = useState(0);
	const [pageRatios, setPageRatios] = useState<Record<string, number>>({});
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const providerId = provider ?? '';
	const addHistory = useHistoryStore((state) => state.addEntry);
	const themeColors = useThemeColors();
	const iconColor = themeColors.foreground;
	const pageSequence = useMemo(() => {
		if (readerMode === 'rtl') {
			return [...pages].reverse();
		}
		return pages;
	}, [pages, readerMode]);
	const isDoubleMode = readerMode === 'double';
	const spreadSequence = useMemo(() => {
		if (!isDoubleMode) {
			return [] as ProviderPage[][];
		}
		const spreads: ProviderPage[][] = [];
		for (let index = 0; index < pageSequence.length; index += 2) {
			spreads.push(pageSequence.slice(index, index + 2));
		}
		return spreads;
	}, [isDoubleMode, pageSequence]);
	const totalPages = isDoubleMode ? spreadSequence.length : pageSequence.length;
	const clampedIndex = Math.min(currentIndex, Math.max(totalPages - 1, 0));
	const currentPage = pageSequence[clampedIndex];
	const currentSpread = isDoubleMode ? spreadSequence[clampedIndex] : undefined;
	const isPagedMode = readerMode === 'ltr' || readerMode === 'rtl' || readerMode === 'double';
	const pageLabel = isDoubleMode
		? `${Math.min(clampedIndex * 2 + 1, pageSequence.length)}-${Math.min(clampedIndex * 2 + 2, pageSequence.length)}/${pageSequence.length}`
		: `${clampedIndex + 1}/${totalPages || 0}`;
	const pageDisplay = pageLabel.includes('/') ? pageLabel.replace('/', ' of ') : pageLabel;
	const insets = useSafeAreaInsets();
	const tapZones = useMemo(() => {
		switch (tapZonePreset) {
			case 'wide-center':
				return { left: 0.2, center: 0.6, right: 0.2 };
			case 'classic':
				return { left: 0.3, center: 0.4, right: 0.3 };
			default:
				return { left: 0.33, center: 0.34, right: 0.33 };
		}
	}, [tapZonePreset]);
	const fitModeValue = fitMode === 'cover' ? 'cover' : fitMode === 'width' ? 'cover' : 'contain';
	const backgroundClassName = background === 'graphite' ? 'bg-card' : background === 'parchment' ? 'bg-chip' : 'bg-background';
	const orderedPages = pageSequence;

	const handlePrev = () => {
		if (totalPages === 0) {
			return;
		}
		setCurrentIndex((index) => Math.max(index - 1, 0));
	};

	const handleNext = () => {
		if (totalPages === 0) {
			return;
		}
		setCurrentIndex((index) => Math.min(index + 1, totalPages - 1));
	};

	const handleTapZone = (x: number) => {
		if (!isPagedMode) {
			if (!showSettings) {
				setChromeVisible((value) => !value);
			}
			return;
		}
		if (!tapNavigationEnabled) {
			if (!showSettings) {
				setChromeVisible((value) => !value);
			}
			return;
		}
		const width = tapWidth || 1;
		const leftEdge = width * tapZones.left;
		const rightEdge = width * (1 - tapZones.right);
		const isRtl = readerMode === 'rtl';
		if (x < leftEdge) {
			if (isRtl) {
				handleNext();
			} else {
				handlePrev();
			}
			return;
		}
		if (x > rightEdge) {
			if (isRtl) {
				handlePrev();
			} else {
				handleNext();
			}
			return;
		}
		if (!showSettings) {
			setChromeVisible((value) => !value);
		}
	};

	const handleSwipe = (direction: 'left' | 'right') => {
		if (!swipeEnabled || !isPagedMode) {
			return;
		}
		const isRtl = readerMode === 'rtl';
		if (direction === 'left') {
			if (isRtl) {
				handleNext();
			} else {
				handlePrev();
			}
			return;
		}
		if (direction === 'right') {
			if (isRtl) {
				handlePrev();
			} else {
				handleNext();
			}
			return;
		}
	};

	useEffect(() => {
		const providerInstance = providers[providerId];
		if (!providerInstance || !chapterId) {
			setError('Provider not available');
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		providerInstance
			.getChapterPages(chapterId)
			.then((data) => {
				setPages(data);
				setCurrentIndex(0);
				setPageRatios({});
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
			.finally(() => setLoading(false));
	}, [chapterId, providerId, providers]);

	useEffect(() => {
		if (!currentPage || !chapterId || totalPages === 0) {
			return;
		}
		addHistory({
			id: `${providerId}-${chapterId}-${clampedIndex}`,
			title: typeof params.mangaTitle === 'string' && params.mangaTitle.length > 0 ? params.mangaTitle : `Chapter ${chapterId}`,
			chapter: typeof params.chapterTitle === 'string' && params.chapterTitle.length > 0 ? params.chapterTitle : chapterId,
			page: clampedIndex + 1,
			readAt: Date.now(),
			readAtLabel: 'Just now',
		});
	}, [addHistory, chapterId, clampedIndex, currentPage, params.chapterTitle, params.mangaTitle, providerId, totalPages]);

	useEffect(() => {
		if (!autoHideChrome || !chromeVisible || showSettings) {
			return;
		}
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
		}
		hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3000);
		return () => {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
			}
		};
	}, [autoHideChrome, chromeVisible, clampedIndex, showSettings]);

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

	const handleSettingsToggle = () => {
		setShowSettings((value) => !value);
		setChromeVisible(true);
	};

	const handleImageLoad = (url: string) => (event: { nativeEvent: { source?: { width?: number; height?: number } } }) => {
		const width = event.nativeEvent.source?.width;
		const height = event.nativeEvent.source?.height;
		if (!width || !height) {
			return;
		}
		const ratio = height / width;
		setPageRatios((current) => {
			if (current[url]) {
				return current;
			}
			return { ...current, [url]: ratio };
		});
	};

	const readerTitle = typeof params.mangaTitle === 'string' && params.mangaTitle.length > 0 ? params.mangaTitle : 'Reader';
	const readerSubtitle =
		typeof params.chapterTitle === 'string' && params.chapterTitle.length > 0 ? params.chapterTitle : `Chapter ${chapterId ?? ''}`;
	const infoMangaId = typeof params.mangaId === 'string' ? params.mangaId : '';

	return (
		<View className={`flex-1 ${backgroundClassName}`}>
			<View className="flex-1">
				{chromeVisible ? (
					<View className="px-5" style={{ paddingTop: 24 + insets.top }}>
						<View className="bg-card rounded-[18px] px-4 py-3">
							<View className="flex-row items-center justify-between">
								<View className="flex-1 pr-4">
									<Text className="text-preset-2 font-heading font-semibold text-foreground" numberOfLines={1}>
										{readerTitle}
									</Text>
									<Text className="text-preset-1 font-body text-muted" numberOfLines={1}>
										{readerSubtitle}
									</Text>
								</View>
								<Pressable onPress={() => setChromeVisible(false)} className="bg-chip h-9 w-9 items-center justify-center rounded-full">
									<Ionicons name="close" size={18} color={iconColor} />
								</Pressable>
							</View>
						</View>
						<View className="mt-3">
							<Link
								href={{
									pathname: '/manga/[id]',
									params: { id: infoMangaId, provider: providerId },
								}}
								asChild
							>
								<Pressable
									onPress={() => {
										if (!infoMangaId) {
											return;
										}
										setChromeVisible(false);
									}}
									className={`bg-chip h-10 w-10 items-center justify-center rounded-full ${infoMangaId ? '' : 'opacity-40'}`}
								>
									<Ionicons name="information" size={18} color={iconColor} />
								</Pressable>
							</Link>
						</View>
					</View>
				) : null}
				{loading ? (
					<View className="items-center justify-center rounded-[28px] border border-border/30 bg-card/70 p-6">
						<ActivityIndicator color={themeColors.accent} />
						<Text className="mt-3 text-preset-1 font-body text-muted">Loading pages…</Text>
					</View>
				) : error ? (
					<View className="rounded-[28px] border border-warning/40 bg-warning/10 p-6">
						<Text className="text-preset-2 font-heading font-semibold text-warning">Unable to load</Text>
						<Text className="mt-2 text-preset-1 font-body text-warning">{error}</Text>
					</View>
				) : pages.length === 0 ? (
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-6">
						<Text className="text-preset-2 font-heading font-semibold text-foreground">No pages yet</Text>
						<Text className="mt-2 text-preset-1 font-body text-muted">This chapter has no pages available.</Text>
					</View>
				) : isPagedMode ? (
					<View className="flex-1">
						<Pressable
							className="flex-1"
							onLayout={(event) => setTapWidth(event.nativeEvent.layout.width)}
							onPress={(event) => handleTapZone(event.nativeEvent.locationX)}
							onTouchStart={(event) => {
								if (!swipeEnabled) {
									return;
								}
								setSwipeStartX(event.nativeEvent.pageX);
							}}
							onTouchEnd={(event) => {
								if (!swipeEnabled || swipeStartX === null) {
									return;
								}
								const delta = event.nativeEvent.pageX - swipeStartX;
								if (Math.abs(delta) > 40) {
									handleSwipe(delta < 0 ? 'left' : 'right');
								}
								setSwipeStartX(null);
							}}
							onTouchMove={() => {
								if (chromeVisible) {
									setChromeVisible(false);
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
								<Image source={{ uri: currentPage.url, headers: currentPage.headers }} className="h-full w-full" resizeMode={fitModeValue} />
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
											setChromeVisible((value) => !value);
										}
									}}
								>
									<Image
										source={{ uri: page.url, headers: page.headers }}
										className="w-full rounded-[26px] bg-card"
										style={{
											height: pageRatios[page.url] && contentWidth ? Math.round(contentWidth * pageRatios[page.url]) : 260,
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
					<View className="absolute inset-x-0 px-5" style={{ bottom: Math.max(insets.bottom, 10), paddingBottom: 12 }}>
						<View className="bg-card flex-row items-center justify-between rounded-3xl px-4 py-3">
							<Pressable
								onPress={() => {
									setReaderMode(readerMode === 'rtl' ? 'ltr' : 'rtl');
								}}
								className="bg-chip h-11 w-11 items-center justify-center rounded-full"
							>
								<Ionicons name="swap-horizontal" size={18} color={iconColor} />
							</Pressable>
							<Pressable onPress={() => setLockRotation(!lockRotation)} className="bg-chip h-11 w-11 items-center justify-center rounded-full">
								<Ionicons name="lock-closed" size={18} color={iconColor} />
							</Pressable>
							<Pressable onPress={handleSettingsToggle} className="bg-chip h-11 w-11 items-center justify-center rounded-full">
								<Ionicons name="settings-sharp" size={18} color={iconColor} />
							</Pressable>
							<View className="flex-row items-center gap-3">
								<Pressable onPress={handlePrev} className="bg-chip h-11 w-11 items-center justify-center rounded-full">
									<Ionicons name="chevron-back" size={18} color={iconColor} />
								</Pressable>
								<Text className="text-preset-1 tracking-[0.2em] text-foreground uppercase">{pageDisplay}</Text>
								<Pressable onPress={handleNext} className="bg-chip h-11 w-11 items-center justify-center rounded-full">
									<Ionicons name="chevron-forward" size={18} color={iconColor} />
								</Pressable>
							</View>
						</View>
					</View>
				) : null}
				{showSettings ? (
					<View className="absolute inset-0 justify-end bg-foreground/30">
						<Pressable className="flex-1" onPress={() => setShowSettings(false)} />
						<View className="rounded-t-4xl border border-border/40 bg-background px-5 pt-6 pb-8">
							<View className="flex-row items-center justify-between">
								<Text className="text-preset-2 font-heading font-semibold text-foreground">Reader Settings</Text>
								<Text className="text-preset-2 font-heading font-semibold text-accent" onPress={() => setShowSettings(false)}>
									Done
								</Text>
							</View>
							<View className="mt-6">
								<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Reader type</Text>
								<View className="mt-3 flex-row overflow-hidden rounded-full border border-border/40 bg-card">
									<Text
										className={`flex-1 px-4 py-2 text-center text-preset-2 font-heading font-semibold ${
											readerMode === 'webtoon' ? 'bg-chip text-foreground' : 'text-muted'
										}`}
										onPress={() => setReaderMode('webtoon')}
									>
										Vertical
									</Text>
									<Text
										className={`flex-1 px-4 py-2 text-center text-preset-2 font-heading font-semibold ${
											readerMode === 'ltr' || readerMode === 'rtl' || readerMode === 'double' ? 'bg-chip text-foreground' : 'text-muted'
										}`}
										onPress={() => setReaderMode('ltr')}
									>
										Horizontal
									</Text>
								</View>
							</View>
							<View className="mt-6">
								<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Reader direction</Text>
								<View className="mt-3 gap-3">
									{(
										[
											{ id: 'ltr', label: 'Left to right' },
											{ id: 'rtl', label: 'Right to left' },
											{ id: 'double', label: 'Double page' },
										] as const
									).map((mode) => (
										<Text
											key={mode.id}
											className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
												readerMode === mode.id ? 'border-accent/80 bg-accent/15 text-accent' : 'border-border/30 bg-card/70 text-muted'
											}`}
											onPress={() => setReaderMode(mode.id)}
										>
											{mode.label}
										</Text>
									))}
								</View>
							</View>
							<View className="mt-6">
								<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Display</Text>
								<View className="mt-3 gap-3">
									{(
										[
											{ id: 'contain', label: 'Fit screen' },
											{ id: 'cover', label: 'Fill screen' },
											{ id: 'width', label: 'Fit width' },
										] as const
									).map((mode) => (
										<Text
											key={mode.id}
											className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
												fitMode === mode.id ? 'border-accent/80 bg-accent/15 text-accent' : 'border-border/30 bg-card/70 text-muted'
											}`}
											onPress={() => setFitMode(mode.id)}
										>
											{mode.label}
										</Text>
									))}
								</View>
							</View>
							<View className="mt-6">
								<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Background</Text>
								<View className="mt-3 gap-3">
									{(
										[
											{ id: 'ink', label: 'Ink' },
											{ id: 'graphite', label: 'Graphite' },
											{ id: 'parchment', label: 'Parchment' },
										] as const
									).map((tone) => (
										<Text
											key={tone.id}
											className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
												background === tone.id ? 'border-accent/80 bg-accent/15 text-accent' : 'border-border/30 bg-card/70 text-muted'
											}`}
											onPress={() => setBackground(tone.id)}
										>
											{tone.label}
										</Text>
									))}
								</View>
							</View>
							<View className="mt-6 gap-4">
								<View className="flex-row items-center justify-between rounded-[20px] border border-border/40 bg-card/80 px-4 py-3">
									<Text className="text-preset-1 font-heading font-semibold text-foreground">Tap navigation</Text>
									<Pressable
										onPress={() => setTapNavigationEnabled(!tapNavigationEnabled)}
										className={`h-6 w-12 rounded-full ${tapNavigationEnabled ? 'bg-success' : 'bg-border'}`}
									>
										<View className={`h-6 w-6 rounded-full bg-background ${tapNavigationEnabled ? 'ml-6' : 'ml-0'}`} />
									</Pressable>
								</View>
								<View className="flex-row items-center justify-between rounded-[20px] border border-border/40 bg-card/80 px-4 py-3">
									<Text className="text-preset-1 font-heading font-semibold text-foreground">Auto-hide controls</Text>
									<Pressable
										onPress={() => setAutoHideChrome(!autoHideChrome)}
										className={`h-6 w-12 rounded-full ${autoHideChrome ? 'bg-success' : 'bg-border'}`}
									>
										<View className={`h-6 w-6 rounded-full bg-background ${autoHideChrome ? 'ml-6' : 'ml-0'}`} />
									</Pressable>
								</View>
								<View className="flex-row items-center justify-between rounded-[20px] border border-border/40 bg-card/80 px-4 py-3">
									<Text className="text-preset-1 font-heading font-semibold text-foreground">Swipe navigation</Text>
									<Pressable
										onPress={() => setSwipeEnabled(!swipeEnabled)}
										className={`h-6 w-12 rounded-full ${swipeEnabled ? 'bg-success' : 'bg-border'}`}
									>
										<View className={`h-6 w-6 rounded-full bg-background ${swipeEnabled ? 'ml-6' : 'ml-0'}`} />
									</Pressable>
								</View>
								<View className="flex-row items-center justify-between rounded-[20px] border border-border/40 bg-card/80 px-4 py-3">
									<Text className="text-preset-1 font-heading font-semibold text-foreground">Lock rotation</Text>
									<Pressable
										onPress={() => setLockRotation(!lockRotation)}
										className={`h-6 w-12 rounded-full ${lockRotation ? 'bg-success' : 'bg-border'}`}
									>
										<View className={`h-6 w-6 rounded-full bg-background ${lockRotation ? 'ml-6' : 'ml-0'}`} />
									</Pressable>
								</View>
							</View>
						</View>
					</View>
				) : null}
			</View>
		</View>
	);
}
