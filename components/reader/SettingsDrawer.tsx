import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	Animated,
	Easing,
	NativeScrollEvent,
	NativeSyntheticEvent,
	PanResponder,
	Pressable,
	ScrollView,
	Text,
	View,
	useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedSegmentControl } from '@components/ui/AnimatedSegmentControl';
import { SegmentRow } from '@components/ui/SegmentRow';
import { ToggleRow } from '@components/ui/ToggleRow';
import { useThemeColors } from '@lib/themes/vars';
import { useSettingsStore } from '@stores/settings';

const DRAWER_COLLAPSED = 0.55;
const DRAWER_FULL = 1.0;
const DISMISS_THRESHOLD = 100;
const SNAP_VELOCITY = 0.5;
const TITLE_SCROLL_THRESHOLD = 28;

export function SettingsDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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

	// Scroll-aware title
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

				if (vy > SNAP_VELOCITY) {
					if (expanded) {
						isExpandedRef.current = false;
						Animated.spring(translateY, {
							toValue: sh - ch,
							useNativeDriver: true,
							damping: 25,
							stiffness: 200,
						}).start(() => setIsExpanded(false));
						Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
					} else {
						dismissRef.current();
					}
					return;
				}

				if (vy < -SNAP_VELOCITY) {
					isExpandedRef.current = true;
					Animated.spring(translateY, {
						toValue: sh - fh,
						useNativeDriver: true,
						damping: 25,
						stiffness: 200,
					}).start(() => setIsExpanded(true));
					Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
					return;
				}

				const distFromDismiss = currentY - (sh - ch);
				if (distFromDismiss > DISMISS_THRESHOLD) {
					dismissRef.current();
					return;
				}

				const midpoint = sh - (ch + fh) / 2;
				if (currentY < midpoint) {
					isExpandedRef.current = true;
					Animated.spring(translateY, {
						toValue: sh - fh,
						useNativeDriver: true,
						damping: 25,
						stiffness: 200,
					}).start(() => setIsExpanded(true));
				} else {
					isExpandedRef.current = false;
					Animated.spring(translateY, {
						toValue: sh - ch,
						useNativeDriver: true,
						damping: 25,
						stiffness: 200,
					}).start(() => setIsExpanded(false));
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
			<Animated.View className="absolute inset-0" style={{ opacity: backdropOpacity }} pointerEvents={isExpanded ? 'none' : 'auto'}>
				<Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={dismiss} />
			</Animated.View>

			<Animated.View
				className="bg-background absolute right-0 bottom-0 left-0"
				style={{
					height: fullHeight,
					transform: [{ translateY }],
					paddingBottom: insets.bottom,
					paddingTop: isExpanded ? insets.top : 0,
					borderTopLeftRadius: isExpanded ? 0 : 24,
					borderTopRightRadius: isExpanded ? 0 : 24,
				}}
			>
				<View
					{...panResponder.panHandlers}
					style={{
						alignItems: 'center',
						paddingTop: isExpanded ? 6 : 12,
						paddingBottom: isExpanded ? 6 : 4,
					}}
				>
					<View
						style={{
							width: 36,
							height: 5,
							borderRadius: 3,
							backgroundColor: themeColors.border,
							opacity: isExpanded ? 0 : 1,
						}}
					/>
				</View>

				<View className="flex-row items-center justify-between px-5 pt-2 pb-3">
					<Animated.Text className="text-preset-4 font-heading text-foreground font-semibold" style={{ opacity: headerTitleOpacity }}>
						Reader Settings
					</Animated.Text>
					<Pressable onPress={dismiss}>
						<Text className="text-preset-2 font-heading text-primary font-semibold">Done</Text>
					</Pressable>
				</View>

				<ScrollView
					ref={scrollRef}
					showsVerticalScrollIndicator={false}
					bounces={true}
					className="flex-1 px-5"
					onScroll={handleScroll}
					scrollEventThrottle={16}
					contentContainerStyle={{ paddingBottom: isExpanded ? 0 : fullHeight - collapsedHeight }}
				>
					<Animated.Text className="text-preset-6 font-heading text-foreground mb-4 font-bold" style={{ opacity: contentTitleOpacity }}>
						Reader Settings
					</Animated.Text>

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

					{isVertical && (
						<>
							<Text className="text-preset-1 text-muted-foreground mb-2 tracking-widest uppercase">Vertical Reader Settings</Text>
							<View className="bg-card/60 mb-6 rounded-xl px-4">
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

					<Pressable onPress={handleApplyGlobally}>
						<Animated.View className="bg-primary mb-8 items-center rounded-xl py-3.5" style={{ transform: [{ scale: applyScale }] }}>
							<Text className="text-primary-foreground text-preset-2 font-heading font-semibold">Apply Globally</Text>
						</Animated.View>
					</Pressable>
				</ScrollView>

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
