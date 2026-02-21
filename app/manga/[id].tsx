import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@lib/themes/vars';
import { useFavoritesStore } from '@services/library/favorites';
import { useExtensionsStore } from '@stores/extensions';
import type { ProviderChapter, ProviderMangaItem } from '../../types/provider';

function formatTimeAgo(timestamp?: number): string {
	if (!timestamp) return '';
	const diff = Date.now() - timestamp;
	const days = Math.floor(diff / 86400000);
	if (days < 1) return 'Today';
	if (days < 7) return `${days}d`;
	if (days < 30) return `${Math.floor(days / 7)}w`;
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
}

export default function MangaDetail() {
	const { id, provider } = useLocalSearchParams<{ id: string; provider?: string }>();
	const providers = useExtensionsStore((state) => state.providers);
	const [details, setDetails] = useState<ProviderMangaItem | null>(null);
	const [chapters, setChapters] = useState<ProviderChapter[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [descriptionExpanded, setDescriptionExpanded] = useState(false);
	const favoriteStore = useFavoritesStore();
	const providerId = provider ?? '';
	const isFavorite = details ? favoriteStore.contains(details.id, providerId) : false;
	const themeColors = useThemeColors();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { width } = useWindowDimensions();
	const headerHeight = 44 + insets.top;

	useEffect(() => {
		const providerInstance = providers[providerId];
		if (!providerInstance || !id) {
			setError('Provider not available');
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		Promise.all([
			providerInstance.getMangaDetails(id).catch((err) => {
				setError(err instanceof Error ? err.message : 'Failed to load');
				return null;
			}),
			providerInstance.getChapterList(id).catch(() => [] as ProviderChapter[]),
		]).then(([detailsResult, chapterResult]) => {
			setDetails(detailsResult);
			setChapters(chapterResult);
			setLoading(false);
		});
	}, [id, providerId, providers]);

	const firstChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;

	return (
		<View className="bg-background flex-1">
			<ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} contentInsetAdjustmentBehavior="never">
				{/* Cover image */}
				{details?.coverUrl ? (
					<Image source={{ uri: details.coverUrl }} style={{ width, height: width * 0.75 }} resizeMode="cover" />
				) : (
					<View className="bg-card" style={{ width, height: width * 0.55 }} />
				)}

				{/* Content section */}
				<View className="px-4 pt-4">
					{loading ? (
						<View className="items-center justify-center py-12">
							<ActivityIndicator size="large" color={themeColors.primary} />
							<Text className="text-muted text-preset-1 font-body mt-3">Loading details…</Text>
						</View>
					) : error ? (
						<View className="bg-card/70 rounded-box p-6">
							<Text className="text-foreground text-preset-2 font-heading font-semibold">Unable to load</Text>
							<Text className="text-muted text-preset-1 font-body mt-2">{error}</Text>
						</View>
					) : details ? (
						<>
							{/* Title and metadata */}
							<Text className="text-foreground text-preset-6 font-heading font-semibold">{details.title}</Text>
							<Text className="text-muted text-preset-1 font-body mt-1" numberOfLines={1}>
								{details.subtitle ?? providerId}
							</Text>

							{/* Action buttons row */}
							<View className="mt-4 flex-row items-center gap-3">
								{firstChapter ? (
									<Link
										href={{
											pathname: '/reader/[chapterId]',
											params: {
												chapterId: firstChapter.id,
												provider: providerId,
												mangaId: details.id,
												chapterTitle: firstChapter.title,
												mangaTitle: details.title,
											},
										}}
										asChild
									>
										<Pressable className="bg-primary rounded-control flex-1 flex-row items-center justify-center gap-2 py-3.5">
											<Ionicons name="book" size={18} color={themeColors.primaryForeground} />
											<Text className="text-primary-foreground text-preset-2 font-heading font-semibold">Read Now</Text>
										</Pressable>
									</Link>
								) : (
									<View className="bg-primary/50 rounded-control flex-1 flex-row items-center justify-center gap-2 py-3.5">
										<Ionicons name="book" size={18} color={themeColors.primaryForeground} />
										<Text className="text-primary-foreground/70 text-preset-2 font-heading font-semibold">Read Now</Text>
									</View>
								)}
								<Pressable
									className={`rounded-control items-center justify-center p-3.5 ${isFavorite ? 'bg-primary' : 'bg-card/70 border-border/30 border'}`}
									onPress={() => {
										if (isFavorite) {
											favoriteStore.remove(details.id, providerId);
										} else {
											favoriteStore.add(details, providerId);
										}
									}}
								>
									<Ionicons
										name={isFavorite ? 'bookmark' : 'bookmark-outline'}
										size={20}
										color={isFavorite ? themeColors.primaryForeground : themeColors.foreground}
									/>
								</Pressable>
								<Pressable className="bg-card/70 border-border/30 rounded-control items-center justify-center border p-3.5">
									<Ionicons name="share-outline" size={20} color={themeColors.foreground} />
								</Pressable>
							</View>

							{/* Description */}
							{details.description ? (
								<View className="mt-4">
									<Text className="text-foreground text-preset-2 font-body leading-relaxed" numberOfLines={descriptionExpanded ? undefined : 4}>
										{details.description}
									</Text>
									<Pressable onPress={() => setDescriptionExpanded(!descriptionExpanded)}>
										<Text className="text-muted text-preset-1 font-heading mt-1 text-right font-semibold">
											{descriptionExpanded ? 'Less' : 'More'}
										</Text>
									</Pressable>
								</View>
							) : null}

							{/* Tags */}
							{details.tags && details.tags.length > 0 && (
								<View className="mt-3 flex-row flex-wrap gap-2">
									{details.tags.map((tag) => (
										<View key={tag} className="border-border/50 rounded-badge border px-3 py-1.5">
											<Text className="text-foreground text-preset-1 font-body">{tag}</Text>
										</View>
									))}
								</View>
							)}

							{/* Chapters section */}
							<View className="border-border/20 mt-6 border-t pt-4">
								<Text className="text-foreground text-preset-3 font-heading mb-3 font-semibold">{chapters.length} Chapters</Text>
								{chapters.length === 0 ? (
									<Text className="text-muted text-preset-1 font-body">No chapters available.</Text>
								) : (
									<View>
										{chapters.map((chapter) => (
											<Link
												key={chapter.id}
												href={{
													pathname: '/reader/[chapterId]',
													params: {
														chapterId: chapter.id,
														provider: providerId,
														mangaId: details.id,
														chapterTitle: chapter.title,
														mangaTitle: details.title,
													},
												}}
												asChild
											>
												<Pressable className="border-border/15 flex-row items-center border-b py-3">
													<View className="bg-primary mr-3 w-0.5 self-stretch rounded-full" />
													<View className="flex-1">
														<Text className="text-foreground text-preset-2 font-heading font-semibold" numberOfLines={1}>
															{chapter.title}
														</Text>
														{(chapter.group || chapter.language) && (
															<Text className="text-muted text-preset-1 font-body mt-0.5" numberOfLines={1}>
																{chapter.language ? `${chapter.language} ` : ''}
																{chapter.group ?? ''}
															</Text>
														)}
													</View>
													{chapter.publishedAt && (
														<Text className="text-muted text-preset-1 font-body ml-2">{formatTimeAgo(chapter.publishedAt)}</Text>
													)}
												</Pressable>
											</Link>
										))}
									</View>
								)}
							</View>
						</>
					) : null}
				</View>
			</ScrollView>

			{/* Fixed header overlay on cover */}
			<View className="absolute top-0 right-0 left-0" style={{ zIndex: 10, height: headerHeight }}>
				<View style={{ paddingTop: insets.top, flex: 1 }} className="flex-row items-center px-4">
					<Pressable onPress={() => router.back()} className="flex-row items-center" hitSlop={8}>
						<Ionicons name="chevron-back" size={22} color={themeColors.primary} />
						<Text className="text-primary text-preset-2 font-body">Back</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}
