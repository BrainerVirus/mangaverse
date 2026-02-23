import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	Image,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MangaCard } from '@components/MangaCard';
import { useDebouncedValue } from '@lib/hooks';
import { useThemeColors } from '@lib/themes/vars';
import { useExtensionsStore } from '@stores/extensions';
import { useSearchStore } from '@stores/search';

import type { ProviderMangaItem } from '../types/provider';

export default function Search() {
	const [query, setQuery] = useState('');
	const [recentSearches, setRecentSearches] = useState<string[]>([]);
	const debouncedQuery = useDebouncedValue(query, 400);
	const providers = useExtensionsStore((state) => state.enabledProviders);
	const { resultsByProvider, searchAll, statusByProvider } = useSearchStore();
	const themeColors = useThemeColors();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const headerHeight = 44 + insets.top;
	const trimmedQuery = debouncedQuery.trim();
	const hasQuery = trimmedQuery.length > 0;
	const isLoading = Object.values(statusByProvider).some((s) => s === 'loading');

	const columnCount = 3;
	const horizontalPadding = 16;
	const columnGap = 10;
	const itemWidth = Math.floor((width - horizontalPadding * 2 - columnGap * (columnCount - 1)) / columnCount);

	useEffect(() => {
		if (!hasQuery) {
			searchAll('', []);
			return;
		}
		searchAll(
			trimmedQuery,
			providers.map((p) => p.id),
		);
	}, [hasQuery, providers, searchAll, trimmedQuery]);

	const handleSearch = useCallback((term: string) => {
		setQuery(term);
		setRecentSearches((prev) => {
			const filtered = prev.filter((s) => s !== term);
			return [term, ...filtered].slice(0, 20);
		});
	}, []);

	const handleSubmit = useCallback(() => {
		const trimmed = query.trim();
		if (trimmed.length === 0) return;
		setRecentSearches((prev) => {
			const filtered = prev.filter((s) => s !== trimmed);
			return [trimmed, ...filtered].slice(0, 20);
		});
	}, [query]);

	const allResults = useMemo(() => {
		const items: (ProviderMangaItem & { providerId: string })[] = [];
		for (const provider of providers) {
			const results = resultsByProvider[provider.id] ?? [];
			for (const item of results) {
				items.push({ ...item, providerId: provider.id });
			}
		}
		return items;
	}, [providers, resultsByProvider]);

	const showResults = hasQuery && allResults.length > 0;
	const showEmpty = hasQuery && !isLoading && allResults.length === 0 && Object.keys(statusByProvider).length > 0;

	return (
		<View className="bg-background flex-1">
			{showResults ? (
				<FlatList
					className="flex-1"
					contentContainerStyle={{
						paddingHorizontal: horizontalPadding,
						paddingTop: headerHeight + 60,
						paddingBottom: 24,
					}}
					data={allResults}
					numColumns={columnCount}
					keyExtractor={(item) => `${item.providerId}-${item.id}`}
					columnWrapperStyle={{ columnGap }}
					renderItem={({ item }) => (
						<Pressable
							style={{ width: itemWidth, marginBottom: 16 }}
							onPress={() => router.push({ pathname: '/manga/[id]', params: { id: item.id, provider: item.providerId } })}
						>
							<MangaCard title={item.title} coverUrl={item.coverUrl} subtitle={item.subtitle} />
						</Pressable>
					)}
				/>
			) : (
				<ScrollView
					className="flex-1"
					contentContainerStyle={{
						paddingTop: headerHeight + 60,
						paddingBottom: 24,
					}}
					contentInsetAdjustmentBehavior="never"
					keyboardShouldPersistTaps="handled"
				>
					{/* Provider icons */}
					{providers.length > 0 && !hasQuery && (
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ paddingHorizontal: 16, columnGap: 12 }}
							className="mb-6"
						>
							{providers.map((provider) => (
								<View key={provider.id} className="items-center" style={{ width: 100 }}>
									<View className="bg-card/70 rounded-box h-24 w-24 items-center justify-center overflow-hidden">
										{provider.meta.icon ? (
											<Image source={{ uri: provider.meta.icon }} className="h-16 w-16" resizeMode="contain" />
										) : (
											<Ionicons name="extension-puzzle" size={32} color={themeColors.primary} />
										)}
									</View>
									<Text className="text-foreground text-preset-1 font-body mt-2 text-center" numberOfLines={1}>
										{provider.name}
									</Text>
								</View>
							))}
						</ScrollView>
					)}

					{/* Loading state */}
					{isLoading && (
						<View className="items-center justify-center py-12">
							<ActivityIndicator size="large" color={themeColors.primary} />
							<Text className="text-muted text-preset-1 font-body mt-3">Searching providers…</Text>
						</View>
					)}

					{/* Empty results */}
					{showEmpty && (
						<View className="items-center justify-center px-8 py-12">
							<Ionicons name="search-outline" size={48} color={themeColors.muted} />
							<Text className="text-foreground text-preset-2 font-heading mt-4 font-semibold">No results found</Text>
							<Text className="text-muted text-preset-1 font-body mt-1 text-center">Try a different term or install more extensions.</Text>
						</View>
					)}

					{/* No providers */}
					{providers.length === 0 && !hasQuery && (
						<View className="items-center justify-center px-8 py-12">
							<Ionicons name="extension-puzzle-outline" size={48} color={themeColors.muted} />
							<Text className="text-foreground text-preset-2 font-heading mt-4 font-semibold">No extensions installed</Text>
							<Text className="text-muted text-preset-1 font-body mt-1 text-center">Install an extension to start searching.</Text>
						</View>
					)}

					{/* Recent searches */}
					{!hasQuery && recentSearches.length > 0 && (
						<View className="mt-2">
							<View className="mb-2 flex-row items-center justify-between px-4">
								<Text className="text-muted-foreground text-preset-1 tracking-[0.15em] uppercase">Recent Searches</Text>
								<Pressable onPress={() => setRecentSearches([])}>
									<Text className="text-primary text-preset-1 font-heading font-semibold tracking-[0.15em] uppercase">Clear</Text>
								</Pressable>
							</View>
							<View className="bg-card/50 mx-4 overflow-hidden rounded-2xl">
								{recentSearches.map((term, index) => (
									<View key={term}>
										<Pressable className="flex-row items-center px-4 py-3" onPress={() => handleSearch(term)}>
											<Ionicons name="time-outline" size={18} color={themeColors.muted} style={{ marginRight: 12 }} />
											<Text className="text-foreground text-preset-2 font-body flex-1">{term}</Text>
										</Pressable>
										{index < recentSearches.length - 1 && <View className="bg-border/30 ml-10.5 h-px" />}
									</View>
								))}
							</View>
						</View>
					)}
				</ScrollView>
			)}

			{/* Fixed header with search */}
			<View className="absolute top-0 right-0 left-0" style={{ zIndex: 10 }}>
				<View className="relative overflow-hidden">
					{Platform.OS === 'ios' ? (
						<BlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
					) : (
						<View className="bg-background/90" style={StyleSheet.absoluteFillObject} />
					)}
					<View style={{ paddingTop: insets.top, height: headerHeight }} className="flex-row items-center justify-between px-4">
						<Text className="text-foreground text-preset-2 font-heading flex-1 text-center font-semibold">Search Everything</Text>
						{hasQuery && (
							<Pressable onPress={() => setQuery('')} hitSlop={8}>
								<Text className="text-primary text-preset-1 font-body">Cancel</Text>
							</Pressable>
						)}
					</View>
				</View>

				{/* Search bar */}
				<View
					className="px-4 pb-3"
					style={{
						backgroundColor: Platform.OS === 'ios' ? 'transparent' : themeColors.background + 'E6',
					}}
				>
					{Platform.OS === 'ios' ? <BlurView intensity={60} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} /> : null}
					<View className="bg-card/80 rounded-control flex-row items-center px-3 py-2.5">
						<Ionicons name="search" size={18} color={themeColors.mutedForeground} />
						<TextInput
							className="text-foreground text-preset-1 font-body ml-2 flex-1"
							placeholder="Search"
							placeholderTextColor={themeColors.mutedForeground}
							value={query}
							onChangeText={setQuery}
							onSubmitEditing={handleSubmit}
							returnKeyType="search"
							autoFocus
						/>
						{query.length > 0 && (
							<Pressable onPress={() => setQuery('')} hitSlop={8}>
								<Ionicons name="close-circle" size={18} color={themeColors.mutedForeground} />
							</Pressable>
						)}
					</View>
				</View>
			</View>
		</View>
	);
}
