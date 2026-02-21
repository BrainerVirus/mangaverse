import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Link } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MangaCard } from '@components/MangaCard';
import { useDebouncedValue } from '@lib/hooks';
import { useThemeColors } from '@lib/themes/vars';
import { useFavoritesStore } from '@services/library/favorites';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

export default function Library() {
	const favorites = useFavoritesStore((state) => state.items);
	const tabBarPadding = useTabBarPadding(16);
	const themeColors = useThemeColors();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const [query, setQuery] = useState('');
	const debouncedQuery = useDebouncedValue(query, 300);
	const columnCount = 3;
	const horizontalPadding = 16;
	const columnGap = 10;
	const itemWidth = Math.floor((width - horizontalPadding * 2 - columnGap * (columnCount - 1)) / columnCount);
	const headerHeight = 44 + insets.top;

	const filtered = useMemo(() => {
		const trimmed = debouncedQuery.trim().toLowerCase();
		if (!trimmed) {
			return favorites;
		}
		return favorites.filter((item) => item.title.toLowerCase().includes(trimmed));
	}, [debouncedQuery, favorites]);

	const renderItem = useCallback(
		({ item }: { item: (typeof favorites)[0] }) => (
			<Link
				href={{
					pathname: '/manga/[id]',
					params: { id: item.id, provider: item.providerId },
				}}
				asChild
			>
				<Pressable style={{ width: itemWidth, marginBottom: 16 }}>
					<MangaCard title={item.title} coverUrl={item.coverUrl} subtitle={item.subtitle} titleLines={2} />
				</Pressable>
			</Link>
		),
		[itemWidth],
	);

	return (
		<View className="bg-background flex-1">
			{favorites.length === 0 ? (
				<View className="flex-1 items-center justify-center px-8" style={{ paddingTop: headerHeight }}>
					<Ionicons name="book-outline" size={64} color={themeColors.muted} />
					<Text className="text-foreground text-preset-4 font-heading mt-6 text-center font-semibold">Your library is empty</Text>
					<Text className="text-muted text-preset-2 font-body mt-2 text-center">Find a series in Discover or Search to add it here.</Text>
					<Link href="/(tabs)/discover" asChild>
						<Pressable className="bg-primary rounded-badge mt-6 px-6 py-3">
							<Text className="text-primary-foreground text-preset-2 font-heading text-center font-semibold">Browse Discover</Text>
						</Pressable>
					</Link>
				</View>
			) : (
				<FlatList
					className="flex-1"
					contentContainerStyle={{
						paddingHorizontal: horizontalPadding,
						paddingTop: headerHeight + 56,
						paddingBottom: tabBarPadding,
					}}
					data={filtered}
					numColumns={columnCount}
					keyExtractor={(item) => `${item.providerId}-${item.id}`}
					columnWrapperStyle={{ columnGap }}
					renderItem={renderItem}
					ListEmptyComponent={
						debouncedQuery.trim() ? (
							<View className="items-center justify-center py-20">
								<Ionicons name="search-outline" size={48} color={themeColors.muted} />
								<Text className="text-foreground text-preset-2 font-heading mt-4 font-semibold">No results</Text>
								<Text className="text-muted text-preset-1 font-body mt-1">No titles match &ldquo;{debouncedQuery.trim()}&rdquo;</Text>
							</View>
						) : null
					}
				/>
			)}

			{/* Fixed header with blur */}
			<View className="absolute top-0 right-0 left-0" style={{ zIndex: 10 }}>
				<View className="relative overflow-hidden">
					{Platform.OS === 'ios' ? (
						<BlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
					) : (
						<View className="bg-background/90" style={StyleSheet.absoluteFillObject} />
					)}
					<View style={{ paddingTop: insets.top, height: headerHeight }} className="flex-row items-center justify-between px-4">
						<Pressable hitSlop={8}>
							<Ionicons name="arrow-down-circle-outline" size={26} color={themeColors.primary} />
						</Pressable>
						<Text className="text-foreground text-preset-2 font-heading font-semibold">Library</Text>
						<Pressable hitSlop={8}>
							<Ionicons name="ellipsis-horizontal" size={26} color={themeColors.foreground} />
						</Pressable>
					</View>
				</View>

				{/* Search bar */}
				{favorites.length > 0 && (
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
								returnKeyType="search"
							/>
							{query.length > 0 && (
								<Pressable onPress={() => setQuery('')} hitSlop={8}>
									<Ionicons name="close-circle" size={18} color={themeColors.mutedForeground} />
								</Pressable>
							)}
						</View>
					</View>
				)}
			</View>
		</View>
	);
}
