import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Animated,
	Easing,
	Image,
	NativeScrollEvent,
	NativeSyntheticEvent,
	PanResponder,
	Pressable,
	ScrollView,
	Switch,
	Text,
	View,
	useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@lib/themes/vars';
import { useExtensionsStore } from '@stores/extensions';
import { useHistoryStore } from '@stores/history';
import { useSettingsStore } from '@stores/settings';
import type { ProviderChapter, ProviderPage } from '../../types/provider';

/* ─── Settings Drawer ─── */
const DRAWER_COLLAPSED = 0.55; // 55% of screen height
const DRAWER_FULL = 1.0; // 100% of screen height (full page when expanded)
const DISMISS_THRESHOLD = 100; // px to drag down before dismissing
const SNAP_VELOCITY = 0.5; // velocity threshold for snap
const TITLE_SCROLL_THRESHOLD = 28; // px scrolled before title moves to header

/* ─── Animated Segment Control ─── */
function AnimatedSegmentControl({
	options,
	value,
	onSelect,
}: {
	options: { id: string; label: string }[];
	value: string;
	onSelect: (id: string) => void;
}) {
	const activeIndex = options.findIndex((o) => o.id === value);
	const indicatorX = useRef(new Animated.Value(0)).current;
	const [segmentWidth, setSegmentWidth] = useState(0);

	useEffect(() => {
		if (segmentWidth > 0) {
			Animated.spring(indicatorX, {
				toValue: activeIndex * segmentWidth,
				useNativeDriver: true,
				damping: 20,
				stiffness: 280,
				mass: 0.8,
			}).start();
		}
	}, [activeIndex, segmentWidth, indicatorX]);

	const handleLayout = useCallback(
		(e: { nativeEvent: { layout: { width: number } } }) => {
			const w = Math.round(e.nativeEvent.layout.width / options.length - 2 / options.length);
			setSegmentWidth((prev) => (prev === w ? prev : w));
		},
		[options.length],
	);

	return (
		<View className="flex-row overflow-hidden rounded-lg p-1" style={{ backgroundColor: 'rgba(120,120,128,0.16)' }} onLayout={handleLayout}>
			{/* Animated indicator */}
			{segmentWidth > 0 && (
				<Animated.View
					className="bg-primary absolute top-1 bottom-1 rounded-md"
					style={{
						width: segmentWidth,
						left: 1,
						transform: [{ translateX: indicatorX }],
					}}
				/>
			)}
			{options.map((opt) => (
				<Pressable key={opt.id} onPress={() => onSelect(opt.id)} className="flex-1 items-center rounded-md py-2.5" style={{ zIndex: 1 }}>
					<Text className={`text-preset-2 font-heading font-semibold ${opt.id === value ? 'text-primary-foreground' : 'text-muted'}`}>
						{opt.label}
					</Text>
				</Pressable>
			))}
		</View>
	);
}

/* ─── Extracted Sub-components (stable references, no flicker) ─── */
function ToggleRow({
	label,
	value,
	onToggle,
	trackColors,
}: {
	label: string;
	value: boolean;
	onToggle: (v: boolean) => void;
	trackColors: { false: string; true: string };
}) {
	return (
		<View className="flex-row items-center justify-between py-3">
			<Text className="text-preset-2 font-body text-foreground">{label}</Text>
			<Switch value={value} onValueChange={onToggle} trackColor={trackColors} thumbColor="#fff" />
		</View>
	);
}

function SegmentRow({
	label,
	value,
	options,
	onSelect,
}: {
	label: string;
	value: string;
	options: { id: string; label: string }[];
	onSelect: (id: string) => void;
}) {
	return (
		<View className="py-3">
			<Text className="text-preset-2 font-body text-foreground mb-2">{label}</Text>
			<AnimatedSegmentControl options={options} value={value} onSelect={onSelect} />
		</View>
	);
}

function SettingsDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
	const themeColors = useThemeColors();
	const { height: screenHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();

	const readerMode = useSettingsStore((s) => s.readerMode);
	const lockRotation = useSettingsStore((s) => s.lockRotation);
	const tapNavigationEnabled = useSettingsStore((s) => s.tapNavigationEnabled);
	const pagePadding = useSettingsStore((s) => s.pagePadding);
	const downsamplePages = useSettingsStore((s) => s.downsamplePages);
	const enablePageSaving = useSettingsStore((s) => s.enablePageSaving);
	const chapterBackground = useSettingsStore((s) => s.chapterBackground);
	const chevronButtonLocation = useSettingsStore((s) => s.chevronButtonLocation);
	const settingsButtonLocation = useSettingsStore((s) => s.settingsButtonLocation);
	const pillarboxAmount = useSettingsStore((s) => s.pillarboxAmount);
	const setReaderMode = useSettingsStore((s) => s.setReaderMode);
	const setLockRotation = useSettingsStore((s) => s.setLockRotation);
	const setTapNavigationEnabled = useSettingsStore((s) => s.setTapNavigationEnabled);
	const setPagePadding = useSettingsStore((s) => s.setPagePadding);
	const setDownsamplePages = useSettingsStore((s) => s.setDownsamplePages);
	const setEnablePageSaving = useSettingsStore((s) => s.setEnablePageSaving);
	const setChapterBackground = useSettingsStore((s) => s.setChapterBackground);
	const setChevronButtonLocation = useSettingsStore((s) => s.setChevronButtonLocation);
	const setSettingsButtonLocation = useSettingsStore((s) => s.setSettingsButtonLocation);
	const setPillarboxAmount = useSettingsStore((s) => s.setPillarboxAmount);

	const isVertical = readerMode === 'webtoon';

	// Animation values
	const collapsedHeight = screenHeight * DRAWER_COLLAPSED;
	const fullHeight = screenHeight * DRAWER_FULL;
	const translateY = useRef(new Animated.Value(screenHeight)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;
	const [isExpanded, setIsExpanded] = useState(false);
	const [mounted, setMounted] = useState(false);
	const scrollRef = useRef<ScrollView>(null);

	// Scroll-aware title: animate opacity instead of LayoutAnimation (avoids global parpadeo)
	const headerTitleOpacity = useRef(new Animated.Value(0)).current;
	const contentTitleOpacity = useRef(new Animated.Value(1)).current;
	const titleInHeaderRef = useRef(false);

	// Toast state
	const [toastVisible, setToastVisible] = useState(false);
	const toastOpacity = useRef(new Animated.Value(0)).current;
	const toastTranslateY = useRef(new Animated.Value(20)).current;

	// Apply Globally button animation
	const applyScale = useRef(new Animated.Value(1)).current;

	// Keep refs in sync for PanResponder closure
	const isExpandedRef = useRef(isExpanded);
	const screenHeightRef = useRef(screenHeight);
	const collapsedHeightRef = useRef(collapsedHeight);
	const fullHeightRef = useRef(fullHeight);
	isExpandedRef.current = isExpanded;
	screenHeightRef.current = screenHeight;
	collapsedHeightRef.current = collapsedHeight;
	fullHeightRef.current = fullHeight;

	// Slide in when visible becomes true, slide out when false
	useEffect(() => {
		if (visible) {
			setMounted(true);
			setIsExpanded(false);
			isExpandedRef.current = false;
			headerTitleOpacity.setValue(0);
			contentTitleOpacity.setValue(1);
			titleInHeaderRef.current = false;
			translateY.setValue(screenHeight);
			Animated.parallel([
				Animated.spring(translateY, {
					toValue: screenHeight - collapsedHeight,
					useNativeDriver: true,
					damping: 25,
					stiffness: 200,
				}),
				Animated.timing(backdropOpacity, {
					toValue: 1,
					duration: 250,
					useNativeDriver: true,
				}),
			]).start();
		} else if (mounted) {
			Animated.parallel([
				Animated.spring(translateY, {
					toValue: screenHeight,
					useNativeDriver: true,
					damping: 25,
					stiffness: 200,
				}),
				Animated.timing(backdropOpacity, {
					toValue: 0,
					duration: 200,
					useNativeDriver: true,
				}),
			]).start(() => setMounted(false));
		}
	}, [visible, screenHeight, collapsedHeight, translateY, backdropOpacity, mounted, headerTitleOpacity, contentTitleOpacity]);

	const dismissRef = useRef(() => {});
	dismissRef.current = () => {
		Animated.parallel([
			Animated.spring(translateY, {
				toValue: screenHeight,
				useNativeDriver: true,
				damping: 25,
				stiffness: 200,
			}),
			Animated.timing(backdropOpacity, {
				toValue: 0,
				duration: 200,
				useNativeDriver: true,
			}),
		]).start(() => {
			setMounted(false);
			onClose();
		});
	};

	const dismiss = useCallback(() => dismissRef.current(), []);

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: (_, gestureState) => {
				return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
			},
			onPanResponderMove: (_, gestureState) => {
				const sh = screenHeightRef.current;
				const ch = collapsedHeightRef.current;
				const fh = fullHeightRef.current;
				const expanded = isExpandedRef.current;
				const currentTarget = expanded ? sh - fh : sh - ch;
				const newY = currentTarget + gestureState.dy;
				const minY = sh - fh;
				const clampedY = Math.max(minY, newY);
				translateY.setValue(clampedY);

				const progress = 1 - Math.max(0, (clampedY - minY) / sh);
				backdropOpacity.setValue(Math.min(1, progress + 0.3));
			},
			onPanResponderRelease: (_, gestureState) => {
				const sh = screenHeightRef.current;
				const ch = collapsedHeightRef.current;
				const fh = fullHeightRef.current;
				const expanded = isExpandedRef.current;
				const currentTarget = expanded ? sh - fh : sh - ch;
				const currentY = currentTarget + gestureState.dy;
				const vy = gestureState.vy;

				// Fast swipe down → dismiss or collapse
				if (vy > SNAP_VELOCITY) {
					if (expanded) {
						setIsExpanded(false);
						isExpandedRef.current = false;
						Animated.spring(translateY, { toValue: sh - ch, useNativeDriver: true, damping: 25, stiffness: 200 }).start();
						Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
					} else {
						dismissRef.current();
					}
					return;
				}

				// Fast swipe up → expand
				if (vy < -SNAP_VELOCITY) {
					setIsExpanded(true);
					isExpandedRef.current = true;
					Animated.spring(translateY, { toValue: sh - fh, useNativeDriver: true, damping: 25, stiffness: 200 }).start();
					Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
					return;
				}

				// Slow drag — snap based on position
				const distFromDismiss = currentY - (sh - ch);
				if (distFromDismiss > DISMISS_THRESHOLD) {
					dismissRef.current();
					return;
				}

				const midpoint = sh - (ch + fh) / 2;
				if (currentY < midpoint) {
					setIsExpanded(true);
					isExpandedRef.current = true;
					Animated.spring(translateY, { toValue: sh - fh, useNativeDriver: true, damping: 25, stiffness: 200 }).start();
				} else {
					setIsExpanded(false);
					isExpandedRef.current = false;
					Animated.spring(translateY, { toValue: sh - ch, useNativeDriver: true, damping: 25, stiffness: 200 }).start();
				}
				Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
			},
		}),
	).current;

	const handleScroll = useCallback(
		(e: NativeSyntheticEvent<NativeScrollEvent>) => {
			const y = e.nativeEvent.contentOffset.y;
			const shouldShow = y > TITLE_SCROLL_THRESHOLD;
			if (shouldShow !== titleInHeaderRef.current) {
				titleInHeaderRef.current = shouldShow;
				Animated.parallel([
					Animated.timing(headerTitleOpacity, {
						toValue: shouldShow ? 1 : 0,
						duration: 200,
						useNativeDriver: true,
					}),
					Animated.timing(contentTitleOpacity, {
						toValue: shouldShow ? 0 : 1,
						duration: 200,
						useNativeDriver: true,
					}),
				]).start();
			}
		},
		[headerTitleOpacity, contentTitleOpacity],
	);

	const showToast = useCallback(() => {
		setToastVisible(true);
		toastOpacity.setValue(0);
		toastTranslateY.setValue(20);
		Animated.parallel([
			Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
			Animated.spring(toastTranslateY, { toValue: 0, useNativeDriver: true, damping: 15, stiffness: 200 }),
		]).start();
		setTimeout(() => {
			Animated.parallel([
				Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
				Animated.timing(toastTranslateY, { toValue: -10, duration: 300, useNativeDriver: true }),
			]).start(() => setToastVisible(false));
		}, 2000);
	}, [toastOpacity, toastTranslateY]);

	const handleApplyGlobally = useCallback(() => {
		// Press animation
		Animated.sequence([
			Animated.timing(applyScale, { toValue: 0.95, duration: 80, easing: Easing.out(Easing.ease), useNativeDriver: true }),
			Animated.timing(applyScale, { toValue: 1, duration: 120, easing: Easing.out(Easing.ease), useNativeDriver: true }),
		]).start();
		showToast();
	}, [applyScale, showToast]);

	const trackColors = useMemo(() => ({ false: themeColors.border, true: themeColors.primary }), [themeColors.border, themeColors.primary]);

	if (!mounted) return null;

	return (
		<View className="absolute inset-0" style={{ zIndex: 30 }} pointerEvents="box-none">
			{/* Backdrop (hidden when expanded) */}
			{!isExpanded && (
				<Animated.View className="absolute inset-0" style={{ opacity: backdropOpacity }}>
					<Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={dismiss} />
				</Animated.View>
			)}

			{/* Drawer */}
			<Animated.View
				className={`bg-background absolute right-0 bottom-0 left-0 ${isExpanded ? '' : 'rounded-t-3xl'}`}
				style={{
					height: fullHeight,
					transform: [{ translateY }],
					paddingBottom: insets.bottom,
					paddingTop: isExpanded ? insets.top : 0,
				}}
			>
				{/* Drag Handle Area (hidden when expanded) */}
				{!isExpanded ? (
					<View {...panResponder.panHandlers} className="items-center pt-3 pb-1">
						<View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: themeColors.border }} />
					</View>
				) : (
					<View {...panResponder.panHandlers} className="h-3" />
				)}

				{/* Sticky Header — title fades in when scrolled past content title */}
				<View className="flex-row items-center justify-between px-5 pt-2 pb-3">
					<Animated.Text className="text-preset-4 font-heading text-foreground font-semibold" style={{ opacity: headerTitleOpacity }}>
						Reader Settings
					</Animated.Text>
					<Pressable onPress={dismiss}>
						<Text className="text-preset-2 font-heading text-primary font-semibold">Done</Text>
					</Pressable>
				</View>

				{/* Scrollable Content */}
				<ScrollView
					ref={scrollRef}
					showsVerticalScrollIndicator={false}
					bounces={true}
					className="flex-1 px-5"
					onScroll={handleScroll}
					scrollEventThrottle={16}
				>
					{/* Title in content — fades out as it scrolls into header */}
					<Animated.Text className="text-preset-6 font-heading text-foreground mb-4 font-bold" style={{ opacity: contentTitleOpacity }}>
						Reader Settings
					</Animated.Text>

					{/* Reader Type */}
					<Text className="text-preset-1 text-muted-foreground mb-2 tracking-widest uppercase">Reader Type</Text>
					<View className="mb-6">
						<AnimatedSegmentControl
							options={[
								{ id: 'webtoon', label: 'Vertical' },
								{ id: 'paged', label: 'Horizontal' },
							]}
							value={readerMode}
							onSelect={(id) => setReaderMode(id as 'webtoon' | 'paged')}
						/>
					</View>

					{/* Vertical Reader Settings */}
					{isVertical && (
						<>
							<Text className="text-preset-1 text-muted-foreground mb-2 tracking-widest uppercase">Vertical Reader Settings</Text>
							<View className="bg-card/60 mb-6 rounded-xl px-4">
								{/* Pillarbox */}
								<View className="flex-row items-center justify-between py-3">
									<Text className="text-preset-2 font-body text-foreground">Pillarbox Amount</Text>
									<View className="flex-row items-center gap-3">
										<Pressable
											onPress={() => setPillarboxAmount(Math.max(0, pillarboxAmount - 1))}
											className="bg-card h-8 w-8 items-center justify-center rounded-lg"
										>
											<Ionicons name="remove" size={16} color={themeColors.foreground} />
										</Pressable>
										<Text className="text-preset-2 font-body text-foreground w-6 text-center">{pillarboxAmount}</Text>
										<Pressable
											onPress={() => setPillarboxAmount(pillarboxAmount + 1)}
											className="bg-card h-8 w-8 items-center justify-center rounded-lg"
										>
											<Ionicons name="add" size={16} color={themeColors.foreground} />
										</Pressable>
									</View>
								</View>
							</View>
						</>
					)}

					{/* General Settings */}
					<Text className="text-preset-1 text-muted-foreground mb-2 tracking-widest uppercase">General Settings</Text>
					<View className="bg-card/60 mb-6 rounded-xl px-4">
						<ToggleRow label="Downsample Pages" value={downsamplePages} onToggle={setDownsamplePages} trackColors={trackColors} />
						<View className="bg-border/20 h-px" />
						<ToggleRow label="Page Padding" value={pagePadding} onToggle={setPagePadding} trackColors={trackColors} />
						<View className="bg-border/20 h-px" />
						<ToggleRow label="Lock Rotation" value={lockRotation} onToggle={setLockRotation} trackColors={trackColors} />
						<View className="bg-border/20 h-px" />
						<ToggleRow label="Enable Tap Navigation" value={tapNavigationEnabled} onToggle={setTapNavigationEnabled} trackColors={trackColors} />
						<View className="bg-border/20 h-px" />
						<ToggleRow label="Enable Page Saving" value={enablePageSaving} onToggle={setEnablePageSaving} trackColors={trackColors} />
						<View className="bg-border/20 h-px" />
						<SegmentRow
							label="Chapter Background"
							value={chapterBackground}
							options={[
								{ id: 'theme', label: 'Theme' },
								{ id: 'black', label: 'Black' },
								{ id: 'white', label: 'White' },
							]}
							onSelect={(id) => setChapterBackground(id as 'theme' | 'black' | 'white')}
						/>
					</View>

					{/* Action Buttons Settings */}
					<Text className="text-preset-1 text-muted-foreground mb-2 tracking-widest uppercase">Action Buttons Settings</Text>
					<View className="bg-card/60 mb-6 rounded-xl px-4">
						<SegmentRow
							label="Chevron Button Location"
							value={chevronButtonLocation}
							options={[
								{ id: 'left', label: 'Left' },
								{ id: 'right', label: 'Right' },
							]}
							onSelect={(id) => setChevronButtonLocation(id as 'left' | 'right')}
						/>
						<View className="bg-border/20 h-px" />
						<SegmentRow
							label="Settings Button Location"
							value={settingsButtonLocation}
							options={[
								{ id: 'left', label: 'Left' },
								{ id: 'right', label: 'Right' },
							]}
							onSelect={(id) => setSettingsButtonLocation(id as 'left' | 'right')}
						/>
					</View>

					{/* Apply Globally */}
					<Pressable onPress={handleApplyGlobally}>
						<Animated.View className="bg-primary mb-8 items-center rounded-xl py-3.5" style={{ transform: [{ scale: applyScale }] }}>
							<Text className="text-primary-foreground text-preset-2 font-heading font-semibold">Apply Globally</Text>
						</Animated.View>
					</Pressable>
				</ScrollView>

				{/* Toast */}
				{toastVisible && (
					<Animated.View
						className="absolute right-5 left-5 items-center rounded-xl px-4 py-3"
						style={{
							bottom: insets.bottom + 16,
							backgroundColor: themeColors.card,
							opacity: toastOpacity,
							transform: [{ translateY: toastTranslateY }],
							shadowColor: '#000',
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.3,
							shadowRadius: 8,
							elevation: 6,
						}}
					>
						<View className="flex-row items-center gap-2">
							<Ionicons name="checkmark-circle" size={18} color={themeColors.primary} />
							<Text className="text-preset-2 font-body text-foreground font-medium">Settings applied globally</Text>
						</View>
					</Animated.View>
				)}
			</Animated.View>
		</View>
	);
}

/* ─── Main Reader ─── */
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

	// Stores
	const providers = useExtensionsStore((s) => s.providers);
	const readerMode = useSettingsStore((s) => s.readerMode);
	const readerDirection = useSettingsStore((s) => s.readerDirection);
	const tapZonePreset = useSettingsStore((s) => s.tapZonePreset);
	const swipeEnabled = useSettingsStore((s) => s.swipeEnabled);
	const tapNavigationEnabled = useSettingsStore((s) => s.tapNavigationEnabled);
	const autoHideChrome = useSettingsStore((s) => s.autoHideChrome);
	const lockRotation = useSettingsStore((s) => s.lockRotation);
	const chapterBackground = useSettingsStore((s) => s.chapterBackground);
	const pagePadding = useSettingsStore((s) => s.pagePadding);
	const setReaderMode = useSettingsStore((s) => s.setReaderMode);
	const setLockRotation = useSettingsStore((s) => s.setLockRotation);
	const addHistory = useHistoryStore((s) => s.addEntry);

	// State
	const [pages, setPages] = useState<ProviderPage[]>([]);
	const [chapters, setChapters] = useState<ProviderChapter[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [chromeVisible, setChromeVisible] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [pageRatios, setPageRatios] = useState<Record<string, number>>({});
	const [tapWidth, setTapWidth] = useState(0);
	const [swipeStartX, setSwipeStartX] = useState<number | null>(null);

	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scrollViewRef = useRef<ScrollView>(null);
	const chromeOpacity = useRef(new Animated.Value(0)).current;

	const isPaged = readerMode === 'paged';
	const isRtl = readerDirection === 'rtl';

	// Pages in display order (reversed for RTL in paged mode)
	const orderedPages = useMemo(() => {
		if (isPaged && isRtl) return [...pages].reverse();
		return pages;
	}, [pages, isPaged, isRtl]);

	const totalPages = orderedPages.length;
	const clampedIndex = Math.min(currentIndex, Math.max(totalPages - 1, 0));
	const currentPage = orderedPages[clampedIndex];

	// Chapter navigation
	const currentChapterIdx = useMemo(() => chapters.findIndex((c) => c.id === chapterId), [chapters, chapterId]);
	const nextChapter = currentChapterIdx > 0 ? chapters[currentChapterIdx - 1] : null;
	const prevChapter = currentChapterIdx < chapters.length - 1 ? chapters[currentChapterIdx + 1] : null;

	// Background color
	const bgStyle = useMemo(() => {
		if (chapterBackground === 'black') return { backgroundColor: '#000' };
		if (chapterBackground === 'white') return { backgroundColor: '#fff' };
		return { backgroundColor: themeColors.background };
	}, [chapterBackground, themeColors.background]);

	// Tap zones
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

	const readerTitle = typeof params.mangaTitle === 'string' && params.mangaTitle.length > 0 ? params.mangaTitle : 'Reader';
	const readerSubtitle =
		typeof params.chapterTitle === 'string' && params.chapterTitle.length > 0 ? params.chapterTitle : `Chapter ${chapterId ?? ''}`;
	const infoMangaId = typeof params.mangaId === 'string' ? params.mangaId : '';
	const pageDisplay = `${clampedIndex + 1} of ${totalPages || 0}`;

	/* ─── Navigation ─── */
	const scrollToPage = useCallback(
		(pageIdx: number) => {
			if (!scrollViewRef.current || isPaged) return;
			let y = 0;
			for (let i = 0; i < pageIdx; i++) {
				const ratio = pageRatios[orderedPages[i]?.url] || 1.5;
				y += Math.round((screenWidth - (pagePadding ? 32 : 0)) * ratio);
			}
			scrollViewRef.current.scrollTo({ y, animated: true });
		},
		[isPaged, pageRatios, orderedPages, screenWidth, pagePadding],
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

	const toggleChrome = useCallback(() => {
		if (showSettings) return;
		setChromeVisible((v) => !v);
	}, [showSettings]);

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
	// Load pages and chapter list
	useEffect(() => {
		const providerInstance = providers[providerId];
		if (!providerInstance || !chapterId) {
			setError('Provider not available');
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		setCurrentIndex(0);
		setPageRatios({});
		setChromeVisible(false);

		const mangaId = typeof params.mangaId === 'string' ? params.mangaId : '';

		Promise.all([
			providerInstance.getChapterPages(chapterId).catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to load');
				return [] as ProviderPage[];
			}),
			mangaId ? providerInstance.getChapterList(mangaId).catch(() => [] as ProviderChapter[]) : Promise.resolve([] as ProviderChapter[]),
		]).then(([pageData, chapterData]) => {
			setPages(pageData);
			setChapters(chapterData);
			setLoading(false);
		});
	}, [chapterId, providerId, providers, params.mangaId]);

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

	// Chrome auto-hide
	useEffect(() => {
		if (!autoHideChrome || !chromeVisible || showSettings) return;
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3000);
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, [autoHideChrome, chromeVisible, clampedIndex, showSettings]);

	// Animate chrome
	useEffect(() => {
		Animated.timing(chromeOpacity, {
			toValue: chromeVisible ? 1 : 0,
			duration: 200,
			useNativeDriver: true,
		}).start();
	}, [chromeVisible, chromeOpacity]);

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
			const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
			const scrollY = contentOffset.y;

			// Track which page is currently visible
			let accHeight = 0;
			for (let i = 0; i < orderedPages.length; i++) {
				const ratio = pageRatios[orderedPages[i].url] || 1.5;
				const imgHeight = screenWidth * ratio;
				accHeight += imgHeight;
				if (accHeight > scrollY + layoutMeasurement.height / 2) {
					if (i !== currentIndex) setCurrentIndex(i);
					break;
				}
			}
		},
		[orderedPages, pageRatios, screenWidth, currentIndex],
	);

	/* ─── Render ─── */
	const paddingH = pagePadding ? 16 : 0;
	const imageWidth = screenWidth - paddingH * 2;

	return (
		<View className="flex-1" style={bgStyle}>
			{/* ─── Page Content ─── */}
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
				/* ─── Horizontal Paged Mode ─── */
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
				/* ─── Vertical Webtoon Mode ─── */
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

					{/* Chapter Navigation at bottom */}
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

			{/* ─── Top Chrome Overlay ─── */}
			<Animated.View
				className="absolute top-0 right-0 left-0"
				style={{ opacity: chromeOpacity, zIndex: chromeVisible ? 20 : -1 }}
				pointerEvents={chromeVisible ? 'auto' : 'none'}
			>
				<LinearGradient
					colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0)']}
					style={{ paddingTop: insets.top + 8, paddingBottom: 32, paddingHorizontal: 16 }}
				>
					{/* Title row */}
					<View className="flex-row items-center">
						<View className="flex-1 pr-3">
							<Text className="text-preset-2 font-heading font-semibold" style={{ color: '#fff' }} numberOfLines={1}>
								{readerTitle}
							</Text>
							<Text className="text-preset-1 font-body mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }} numberOfLines={1}>
								{readerSubtitle}
							</Text>
						</View>
						<Pressable
							onPress={() => router.back()}
							className="h-9 w-9 items-center justify-center rounded-full"
							style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
							hitSlop={8}
						>
							<Ionicons name="close" size={20} color="#fff" />
						</Pressable>
					</View>

					{/* Info button */}
					{infoMangaId ? (
						<View className="mt-3">
							<Link
								href={{
									pathname: '/manga/[id]',
									params: { id: infoMangaId, provider: providerId },
								}}
								asChild
							>
								<Pressable
									className="h-10 w-10 items-center justify-center rounded-full"
									style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
									hitSlop={8}
								>
									<Ionicons name="information" size={20} color="#fff" />
								</Pressable>
							</Link>
						</View>
					) : null}
				</LinearGradient>
			</Animated.View>

			{/* ─── Bottom Chrome Overlay ─── */}
			<Animated.View
				className="absolute right-0 bottom-0 left-0"
				style={{ opacity: chromeOpacity, zIndex: chromeVisible ? 20 : -1 }}
				pointerEvents={chromeVisible ? 'auto' : 'none'}
			>
				<LinearGradient
					colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
					style={{ paddingBottom: Math.max(insets.bottom, 12) + 8, paddingTop: 32, paddingHorizontal: 16 }}
				>
					<View className="flex-row items-center justify-between">
						{/* Left actions */}
						<View className="flex-row items-center gap-4">
							<Pressable onPress={() => setReaderMode(isPaged ? 'webtoon' : 'paged')} className="items-center" hitSlop={8}>
								<Ionicons name={isPaged ? 'swap-vertical' : 'book-outline'} size={22} color="#fff" />
								<Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 }}>{isPaged ? 'Scroll' : 'Paged'}</Text>
							</Pressable>
							<Pressable onPress={() => setLockRotation(!lockRotation)} hitSlop={8}>
								<Ionicons name={lockRotation ? 'lock-closed' : 'lock-open-outline'} size={22} color={lockRotation ? themeColors.primary : '#fff'} />
							</Pressable>
							<Pressable
								onPress={() => {
									setShowSettings(true);
									setChromeVisible(false);
								}}
								hitSlop={8}
							>
								<Ionicons name="settings-sharp" size={22} color="#fff" />
							</Pressable>
						</View>

						{/* Pagination */}
						<View className="flex-row items-center gap-3">
							<Pressable onPress={handlePrev} hitSlop={8}>
								<Ionicons name="chevron-back" size={22} color="#fff" />
							</Pressable>
							<Text className="text-preset-1 font-body" style={{ color: '#fff', minWidth: 60, textAlign: 'center' }}>
								{pageDisplay}
							</Text>
							<Pressable onPress={handleNext} hitSlop={8}>
								<Ionicons name="chevron-forward" size={22} color="#fff" />
							</Pressable>
						</View>
					</View>
				</LinearGradient>
			</Animated.View>

			{/* ─── Settings Drawer ─── */}
			<SettingsDrawer visible={showSettings} onClose={() => setShowSettings(false)} />
		</View>
	);
}
