import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useThemeColors } from '@lib/themes/vars';
import { useFavoritesStore } from '@services/library/favorites';
import { useExtensionsStore } from '@stores/extensions';
import type { ProviderChapter, ProviderMangaItem } from '../../types/provider';

export default function MangaDetail() {
	const { id, provider } = useLocalSearchParams<{ id: string; provider?: string }>();
	const providers = useExtensionsStore((state) => state.providers);
	const [details, setDetails] = useState<ProviderMangaItem | null>(null);
	const [chapters, setChapters] = useState<ProviderChapter[]>([]);
	const [loading, setLoading] = useState(true);
	const [detailsError, setDetailsError] = useState<string | null>(null);
	const [chaptersError, setChaptersError] = useState<string | null>(null);
	const favoriteStore = useFavoritesStore();
	const providerId = provider ?? '';
	const isFavorite = details ? favoriteStore.contains(details.id, providerId) : false;
	const themeColors = useThemeColors();

	useEffect(() => {
		const providerInstance = providers[providerId];
		if (!providerInstance || !id) {
			setDetailsError('Provider not available');
			setChaptersError('Provider not available');
			setLoading(false);
			return;
		}
		setLoading(true);
		setDetailsError(null);
		setChaptersError(null);
		const loadDetails = async () => {
			const [detailsResult, chapterResult] = await Promise.all([
				providerInstance.getMangaDetails(id).catch((err) => {
					setDetailsError(err instanceof Error ? err.message : 'Failed to load details');
					return null;
				}),
				providerInstance.getChapterList(id).catch((err) => {
					setChaptersError(err instanceof Error ? err.message : 'Failed to load chapters');
					return [] as ProviderChapter[];
				}),
			]);
			setDetails(detailsResult);
			setChapters(chapterResult);
		};
		loadDetails().finally(() => setLoading(false));
	}, [id, providerId, providers]);
	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Manga" subtitle={details?.title ?? 'Loading'} />
				<View className="border-border/30 bg-card/70 rounded-[28px] border p-5">
					{loading ? (
						<View className="items-center justify-center py-6">
							<ActivityIndicator color={themeColors.accent} />
							<Text className="text-preset-1 font-body text-muted mt-3">Loading details…</Text>
						</View>
					) : detailsError ? (
						<View className="border-warning/40 bg-warning/10 rounded-[24px] border p-4">
							<Text className="text-preset-1 font-body text-warning">{detailsError}</Text>
						</View>
					) : details ? (
						<View className="flex-row gap-4">
							{details.coverUrl ? (
								<Image source={{ uri: details.coverUrl }} className="h-40 w-28 rounded-[20px]" />
							) : (
								<View className="bg-card h-40 w-28 rounded-[20px]" />
							)}
							<View className="flex-1">
								<Text className="text-preset-2 font-heading text-foreground font-semibold">{details.title}</Text>
								<Text className="text-preset-1 text-muted-foreground mt-2 tracking-[0.2em] uppercase">{providerId}</Text>
								<Text className="text-preset-1 font-body text-muted mt-3" numberOfLines={4}>
									{details.description || 'No description yet.'}
								</Text>
							</View>
						</View>
					) : null}
					{details ? (
						<Text
							className={`text-preset-1 font-heading mt-4 rounded-full px-4 py-2 text-center font-semibold tracking-[0.2em] uppercase ${
								isFavorite ? 'bg-primary text-primary-foreground' : 'bg-chip text-muted'
							}`}
							onPress={() => {
								if (isFavorite) {
									favoriteStore.remove(details.id, providerId);
								} else {
									favoriteStore.add(details, providerId);
								}
							}}
						>
							{isFavorite ? 'In library' : 'Add to library'}
						</Text>
					) : null}
				</View>
				<View className="border-border/30 bg-card/70 mt-6 rounded-[28px] border p-5">
					<Text className="text-preset-2 font-heading text-foreground font-semibold">Chapters</Text>
					{chaptersError ? (
						<Text className="text-preset-1 font-body text-warning mt-2">{chaptersError}</Text>
					) : chapters.length === 0 ? (
						<Text className="text-preset-1 font-body text-muted mt-2">No chapters loaded yet.</Text>
					) : (
						<View className="mt-3 gap-3">
							{chapters.slice(0, 12).map((chapter, index) => (
								<Link
									key={chapter.id}
									href={{
										pathname: '/reader/[chapterId]',
										params: {
											chapterId: chapter.id,
											provider: providerId,
											mangaId: details?.id ?? '',
											chapterTitle: chapter.title,
											mangaTitle: details?.title ?? '',
										},
									}}
									className="border-border/30 bg-background/80 rounded-[22px] border px-4 py-3"
								>
									<View className="flex-row items-center justify-between">
										<View className="pr-4">
											<Text className="text-preset-1 font-heading text-foreground font-semibold">{chapter.title}</Text>
											{chapter.language ? (
												<Text className="text-preset-1 text-muted-foreground mt-1 tracking-[0.2em] uppercase">{chapter.language}</Text>
											) : null}
										</View>
										<View className="border-border/40 bg-card/70 rounded-full border px-3 py-1">
											<Text className="text-preset-1 text-muted tracking-[0.2em] uppercase">{index + 1}</Text>
										</View>
									</View>
								</Link>
							))}
						</View>
					)}
				</View>
			</ScrollView>
		</View>
	);
}
