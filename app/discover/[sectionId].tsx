import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MangaCard } from '@components/MangaCard';
import { useThemeColors } from '@lib/themes/vars';
import { useFavoritesStore } from '@services/library/favorites';
import { useExtensionsStore } from '@stores/extensions';
import type { ProviderMangaItem } from '../../types/provider';

const PAGE_SIZE = 20;
const GENRE_RESULTS_PAGE_SIZE = 24;

export default function DiscoverSection() {
	const params = useLocalSearchParams<{
		sectionId: string;
		provider?: string;
		title?: string;
	}>();
	const router = useRouter();
	const providers = useExtensionsStore((state) => state.providers);
	const favoriteStore = useFavoritesStore();
	const sectionId = params.sectionId;
	const providerId = params.provider ?? '';
	const [items, setItems] = useState<ProviderMangaItem[]>([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(true);
	const themeColors = useThemeColors();
	const { width } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const columnCount = 3;
	const horizontalPadding = 16;
	const columnGap = 10;
	const itemWidth = Math.floor((width - horizontalPadding * 2 - columnGap * (columnCount - 1)) / columnCount);
	const headerHeight = 44 + insets.top;

	const title = useMemo(() => {
		if (typeof params.title === 'string' && params.title.length > 0) {
			return params.title;
		}
		return sectionId ?? 'Section';
	}, [params.title, sectionId]);

	const loadPage = useCallback(
		async (nextPage: number) => {
			const provider = providers[providerId];
			if (!provider || !sectionId) {
				setError('Provider not available');
				setLoading(false);
				return;
			}
			if (sectionId === 'genres') {
				const allGenres = await provider.getDiscoverGenres();
				const sliceStart = (nextPage - 1) * PAGE_SIZE;
				const sliceEnd = sliceStart + PAGE_SIZE;
				const data = allGenres.slice(sliceStart, sliceEnd);
				setItems((current) => (nextPage === 1 ? data : [...current, ...data]));
				setHasMore(sliceEnd < allGenres.length);
				setPage(nextPage);
				return;
			}
			const data = await provider.getDiscoverSectionItems(sectionId, nextPage);
			setItems((current) => (nextPage === 1 ? data : [...current, ...data]));
			setHasMore(data.length >= PAGE_SIZE);
			setPage(nextPage);
		},
		[providerId, providers, sectionId],
	);

	const loadGenreResults = useCallback(
		async (nextPage: number) => {
			const provider = providers[providerId];
			if (!provider || !sectionId) {
				setError('Provider not available');
				setLoading(false);
				return;
			}
			const data = await provider.getDiscoverSectionItems('genres', nextPage, {
				genreId: sectionId,
			});
			setItems((current) => (nextPage === 1 ? data : [...current, ...data]));
			setHasMore(data.length >= GENRE_RESULTS_PAGE_SIZE);
			setPage(nextPage);
		},
		[providerId, providers, sectionId],
	);

	useEffect(() => {
		setLoading(true);
		setError(null);
		const provider = providers[providerId];
		if (!provider || !sectionId) {
			setError('Provider not available');
			setLoading(false);
			return;
		}
		const load = async () => {
			if (sectionId === 'genres') {
				await loadPage(1);
				return;
			}
			const sections = await provider.getDiscoverSections();
			const isKnownSection = sections.some((section) => section.id === sectionId);
			if (isKnownSection) {
				await loadPage(1);
				return;
			}
			await loadGenreResults(1);
		};
		load()
			.catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
			.finally(() => setLoading(false));
	}, [loadGenreResults, loadPage, providerId, providers, sectionId]);

	const handleEndReached = () => {
		if (loadingMore || loading || !hasMore) {
			return;
		}
		setLoadingMore(true);
		const isGenreSelection = sectionId && sectionId !== 'genres';
		const load = isGenreSelection ? loadGenreResults : loadPage;
		load(page + 1)
			.catch(() => {})
			.finally(() => setLoadingMore(false));
	};

	return (
		<View className="bg-background flex-1">
			<FlatList
				className="flex-1"
				contentContainerStyle={{
					paddingHorizontal: horizontalPadding,
					paddingTop: headerHeight + 12,
					paddingBottom: 24,
				}}
				data={items}
				numColumns={columnCount}
				keyExtractor={(item) => item.id}
				columnWrapperStyle={{ columnGap }}
				ListFooterComponent={
					loadingMore ? (
						<View className="items-center py-6">
							<ActivityIndicator color={themeColors.primary} />
						</View>
					) : null
				}
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.6}
				renderItem={({ item }) => (
					<Link
						href={{
							pathname: '/manga/[id]',
							params: { id: item.id, provider: providerId },
						}}
						asChild
					>
						<Pressable
							style={{
								width: itemWidth,
								marginBottom: 16,
							}}
						>
							<MangaCard
								title={item.title}
								subtitle={item.subtitle}
								coverUrl={item.coverUrl}
								inLibrary={favoriteStore.contains(item.id, providerId)}
							/>
						</Pressable>
					</Link>
				)}
				ListEmptyComponent={
					loading ? (
						<View className="items-center justify-center py-20">
							<ActivityIndicator size="large" color={themeColors.primary} />
							<Text className="text-muted text-preset-1 font-body mt-4">Loading titles…</Text>
						</View>
					) : error ? (
						<View className="bg-card/70 rounded-box border-border/30 border p-6">
							<Text className="text-foreground text-preset-2 font-heading font-semibold">Unable to load</Text>
							<Text className="text-muted text-preset-1 font-body mt-2">{error}</Text>
						</View>
					) : (
						<View className="bg-card/70 rounded-box border-border/30 border p-6">
							<Text className="text-foreground text-preset-2 font-heading font-semibold">No titles found</Text>
							<Text className="text-muted text-preset-1 font-body mt-2">This section has no items yet.</Text>
						</View>
					)
				}
			/>

			{/* Fixed header with blur */}
			<View className="absolute top-0 right-0 left-0" style={{ zIndex: 10 }}>
				<View className="relative overflow-hidden">
					{Platform.OS === 'ios' ? (
						<BlurView intensity={80} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFillObject} />
					) : (
						<View className="bg-background/90" style={StyleSheet.absoluteFillObject} />
					)}
					<View
						style={{
							paddingTop: insets.top,
							height: headerHeight,
						}}
						className="flex-row items-center px-4"
					>
						<Pressable onPress={() => router.back()} className="flex-row items-center" hitSlop={8}>
							<Ionicons name="chevron-back" size={22} color={themeColors.primary} />
							<Text className="text-primary text-preset-2 font-body">Discover</Text>
						</Pressable>
						<Text
							className="text-foreground text-preset-2 font-heading absolute right-0 left-0 text-center font-semibold"
							style={{ top: insets.top + 10 }}
							numberOfLines={1}
						>
							{title}
						</Text>
					</View>
				</View>
				<View className="bg-border/20 h-px" />
			</View>
		</View>
	);
}
