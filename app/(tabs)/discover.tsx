import { BlurView } from 'expo-blur';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscoverHeader } from '@components/discover/DiscoverHeader';
import { DiscoverSections } from '@components/discover/DiscoverSections';
import { DiscoverSkeleton } from '@components/discover/DiscoverSkeleton';
import { DiscoverStates } from '@components/discover/DiscoverStates';
import { ErrorDrawer } from '@components/discover/ErrorDrawer';
import { HeroCarousel } from '@components/discover/HeroCarousel';
import { useDiscoverData } from '@hooks/useDiscoverData';
import { useTabBarPadding } from '@hooks/useTabBarPadding';
import { getDiscoverLayout } from '@lib/layout';
import { useFavoritesStore } from '@services/library/favorites';
import { useExtensionsStore } from '@stores/extensions';
import { useSettingsStore } from '@stores/settings';
import type { ProviderMangaItem } from '../../types/provider';

export default function Discover() {
	const providers = useExtensionsStore((state) => state.enabledProviders);
	const selectedProviderId = useExtensionsStore((state) => state.selectedProviderId);
	const setSelectedProvider = useExtensionsStore((state) => state.setSelectedProvider);
	const providersMap = useExtensionsStore((state) => state.providers);
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders);
	const loadErrors = useExtensionsStore((state) => state.loadErrors);
	const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});
	const indicatorX = useRef(new Animated.Value(0)).current;
	const indicatorWidth = useRef(new Animated.Value(0)).current;
	const indicatorReady = useRef(false);
	const favoriteStore = useFavoritesStore();
	const showProviderErrors = useSettingsStore((state) => state.showProviderErrors);
	const hasProviders = providers.length > 0;
	const providerLoadError = selectedProviderId ? loadErrors[selectedProviderId] : undefined;
	const [errorDrawerOpen, setErrorDrawerOpen] = useState(false);
	const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
	const errorDrawerHeight = useRef(new Animated.Value(0)).current;
	const errorDrawerBaseHeight = 260;
	const errorDrawerMaxHeight = 520;
	const { width: screenWidth } = useWindowDimensions();
	const { pagePadding, gap, cardWidth, heroWidth, peek } = useMemo(() => getDiscoverLayout(screenWidth), [screenWidth]);
	const heroSpacing = gap;
	const heroScrollX = useRef(new Animated.Value(0)).current;
	const heroScrollRef = useRef<ScrollView>(null);
	const insets = useSafeAreaInsets();
	const tabBarPadding = useTabBarPadding(16);
	const scrollY = useRef(new Animated.Value(0)).current;
	const { orderedSections, sectionItems, loading, error, heroItems, loadMore, sectionLoading } = useDiscoverData({
		providersMap,
		selectedProviderId,
		refreshProviders,
	});

	useEffect(() => {
		if (!showProviderErrors || !providerLoadError) {
			setErrorDrawerOpen(false);
			return;
		}
		setErrorDrawerOpen(true);
	}, [providerLoadError, showProviderErrors]);

	useEffect(() => {
		const targetHeight = errorDrawerOpen ? (isDrawerExpanded ? errorDrawerMaxHeight : errorDrawerBaseHeight) : 0;
		Animated.timing(errorDrawerHeight, {
			toValue: targetHeight,
			duration: 220,
			useNativeDriver: false,
		}).start();
	}, [errorDrawerBaseHeight, errorDrawerHeight, errorDrawerMaxHeight, errorDrawerOpen, isDrawerExpanded]);

	useEffect(() => {
		const layout = selectedProviderId ? tabLayouts[selectedProviderId] : null;
		if (!layout) {
			return;
		}
		const { x, width } = layout;
		if (!indicatorReady.current) {
			indicatorX.setValue(x);
			indicatorWidth.setValue(width);
			indicatorReady.current = true;
			return;
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
		]).start();
	}, [indicatorWidth, indicatorX, selectedProviderId, tabLayouts]);

	const handleOpenProvider = async () => {
		const providerId = selectedProviderId;
		if (!providerId) {
			return;
		}
		const provider = providersMap[providerId];
		const url = provider?.meta.baseUrl || '';
		if (!url) {
			return;
		}
		await WebBrowser.openBrowserAsync(url);
	};

	const handleToggleDrawerHeight = () => {
		if (!errorDrawerOpen) {
			setErrorDrawerOpen(true);
			setIsDrawerExpanded(false);
			return;
		}
		setIsDrawerExpanded((current) => !current);
	};

	useEffect(() => {
		if (!errorDrawerOpen) {
			return;
		}
		Animated.timing(errorDrawerHeight, {
			toValue: isDrawerExpanded ? errorDrawerMaxHeight : errorDrawerBaseHeight,
			duration: 200,
			useNativeDriver: false,
		}).start();
	}, [errorDrawerBaseHeight, errorDrawerHeight, errorDrawerMaxHeight, errorDrawerOpen, isDrawerExpanded]);

	const handleCloseDrawer = () => {
		setErrorDrawerOpen(false);
		setIsDrawerExpanded(false);
	};

	const handleToggleFavorite = (item: ProviderMangaItem) => {
		const providerId = selectedProviderId;
		if (!providerId) {
			return;
		}
		if (favoriteStore.contains(item.id, providerId)) {
			favoriteStore.remove(item.id, providerId);
			return;
		}
		favoriteStore.add(item, providerId);
	};

	const headerPaddingTop = Math.max(insets.top, 16);
	const blurOpacity = scrollY.interpolate({
		inputRange: [0, 48],
		outputRange: [0, 1],
		extrapolate: 'clamp',
	});
	const solidOpacity = scrollY.interpolate({
		inputRange: [0, 48],
		outputRange: [1, 0],
		extrapolate: 'clamp',
	});
	return (
		<View className="bg-background flex-1">
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="never"
				contentContainerStyle={{ paddingBottom: tabBarPadding }}
				stickyHeaderIndices={[0]}
				onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
					useNativeDriver: false,
				})}
				scrollEventThrottle={16}
			>
				<View className="border-border/40 border-b">
					<View className="relative">
						<Animated.View style={[StyleSheet.absoluteFillObject, { opacity: solidOpacity }]} className="bg-background" />
						<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: blurOpacity }]}>
							<BlurView intensity={60} tint="default" style={StyleSheet.absoluteFillObject} />
							<View className="bg-background/40" style={StyleSheet.absoluteFillObject} />
						</Animated.View>
						<View
							style={{
								paddingTop: headerPaddingTop,
								paddingHorizontal: pagePadding,
								paddingBottom: 12,
							}}
						>
							<DiscoverHeader
								providers={providers}
								selectedProviderId={selectedProviderId}
								onSelectProvider={setSelectedProvider}
								onOpenProvider={handleOpenProvider}
								indicatorX={indicatorX}
								indicatorWidth={indicatorWidth}
								gap={gap}
								onTabLayout={(id, layout) => setTabLayouts((current) => ({ ...current, [id]: layout }))}
							/>
						</View>
					</View>
				</View>
				<View style={{ paddingHorizontal: pagePadding }}>
					{loading ? (
						<DiscoverSkeleton gap={gap} cardWidth={cardWidth} heroWidth={heroWidth} peek={peek} />
					) : (
						<HeroCarousel
							heroItems={heroItems}
							heroWidth={heroWidth}
							heroSpacing={heroSpacing}
							pagePadding={pagePadding}
							peek={peek}
							heroScrollX={heroScrollX}
							heroScrollRef={heroScrollRef}
							selectedProviderId={selectedProviderId}
							onToggleFavorite={handleToggleFavorite}
							isFavorite={(item) => favoriteStore.contains(item.id, selectedProviderId ?? '')}
						/>
					)}
					{loading ? null : <DiscoverStates loading={loading} error={error} hasProviders={hasProviders} />}
					{!loading && !error && hasProviders ? (
						<DiscoverSections
							sections={orderedSections}
							sectionItems={sectionItems}
							providerId={selectedProviderId}
							pagePadding={pagePadding}
							gap={gap}
							cardWidth={cardWidth}
							peek={peek}
							sectionLoading={sectionLoading}
							onLoadMore={loadMore}
							isInLibrary={(itemId) => favoriteStore.contains(itemId, selectedProviderId ?? '')}
						/>
					) : null}
				</View>
			</ScrollView>
			{showProviderErrors && providerLoadError ? (
				<ErrorDrawer
					providerLoadError={providerLoadError}
					height={errorDrawerHeight}
					onToggleHeight={handleToggleDrawerHeight}
					onClose={handleCloseDrawer}
				/>
			) : null}
		</View>
	);
}
