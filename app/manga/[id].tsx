import GradientWrapper from '@components/ui/GradientWrapper';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@components/ui/Button';
import { withAlpha } from '@lib/colors/hex';
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

/* ── Isolated chapter row (follows HistoryRow pattern) ── */

interface ChapterRowProps {
	chapter: ProviderChapter;
	borderColor: string;
	foregroundColor: string;
	mutedColor: string;
	onPress: () => void;
}

const ChapterRow = React.memo(function ChapterRow({ chapter, borderColor, foregroundColor, mutedColor, onPress }: ChapterRowProps) {
	const chapterLabel = chapter.chapterNumber != null ? `Ch. ${chapter.chapterNumber}` : chapter.title;
	const subtitle = chapter.chapterNumber != null && chapter.title !== chapterLabel ? chapter.title : null;
	const meta = [chapter.language, chapter.group].filter(Boolean).join(' · ');

	return (
		<Pressable
			onPress={onPress}
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				paddingVertical: 12,
				borderBottomWidth: 1,
				borderBottomColor: borderColor,
			}}
		>
			<View style={{ flex: 1 }}>
				<Text className="text-preset-2 font-heading font-semibold" style={{ color: foregroundColor }} numberOfLines={1}>
					{chapterLabel}
				</Text>
				{subtitle ? (
					<Text className="text-preset-1 font-body" style={{ color: mutedColor, marginTop: 2 }} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
				{meta ? (
					<Text className="text-preset-1 font-body" style={{ color: mutedColor, opacity: 0.7, marginTop: 2 }} numberOfLines={1}>
						{meta}
					</Text>
				) : null}
			</View>
			{chapter.publishedAt ? (
				<Text className="text-preset-1 font-body" style={{ color: mutedColor, marginLeft: 12 }}>
					{formatTimeAgo(chapter.publishedAt)}
				</Text>
			) : null}
		</Pressable>
	);
});

/* ── Main screen ── */

export default function MangaDetail() {
	const { id, provider } = useLocalSearchParams<{ id: string; provider?: string }>();
	const providers = useExtensionsStore((state) => state.providers);
	const [details, setDetails] = useState<ProviderMangaItem | null>(null);
	const [chapters, setChapters] = useState<ProviderChapter[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const favoriteStore = useFavoritesStore();
	const providerId = provider ?? '';
	const isFavorite = details ? favoriteStore.contains(details.id, providerId) : false;
	const themeColors = useThemeColors();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { width } = useWindowDimensions();
	const headerHeight = 44 + insets.top;

	// Hero gradient
	const heroHeight = width * 1.2;
	const heroGradientStart = withAlpha(themeColors.background, 0);
	const heroGradientMid = withAlpha(themeColors.background, 0.5);
	const heroGradientEnd = withAlpha(themeColors.background, 0.95);

	// Description expand/collapse
	const [descExpanded, setDescExpanded] = useState(false);

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

	// Sort chapters ascending by chapterNumber for display
	const sortedChapters = useMemo(() => {
		return [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
	}, [chapters]);

	const firstChapter = sortedChapters.length > 0 ? sortedChapters[0] : null;

	const handleShare = useCallback(async () => {
		if (!details) return;
		try {
			await Share.share({ message: `Check out ${details.title}`, title: details.title });
		} catch {
			// User cancelled or platform error
		}
	}, [details]);

	const navigateToChapter = useCallback(
		(chapter: ProviderChapter) => {
			if (!details) return;
			router.push({
				pathname: '/reader/[chapterId]',
				params: {
					chapterId: chapter.id,
					provider: providerId,
					mangaId: details.id,
					chapterTitle: chapter.title,
					mangaTitle: details.title,
				},
			});
		},
		[router, providerId, details],
	);

	const chapterBorderColor = withAlpha(themeColors.border, 0.15);

	return (
		<View className="bg-background flex-1">
			<ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} contentInsetAdjustmentBehavior="automatic">
				{/* Hero section */}
				<View style={{ width, height: heroHeight }}>
					{details?.coverUrl ? (
						<Image source={{ uri: details.coverUrl }} style={{ width, height: heroHeight }} resizeMode="cover" />
					) : (
						<View className="bg-card" style={{ width, height: heroHeight }} />
					)}
					<GradientWrapper colors={[heroGradientStart, heroGradientMid, heroGradientEnd]} locations={[0, 0.5, 1]} />
					{!loading && details ? (
						<View className="absolute inset-x-0 bottom-0 px-4 pb-4">
							<Text className="text-foreground text-preset-6 font-heading font-semibold" numberOfLines={2}>
								{details.title}
							</Text>
							<Text className="text-muted text-preset-1 font-body mt-1" numberOfLines={1}>
								{details.subtitle ?? providerId}
							</Text>
						</View>
					) : null}
				</View>

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
							{/* Action buttons row */}
							<View className="flex-row items-center gap-3">
								<Button
									label="Read Now"
									variant="primary"
									size="lg"
									icon="book"
									className="flex-1"
									disabled={!firstChapter}
									href={
										firstChapter
											? {
													pathname: '/reader/[chapterId]',
													params: {
														chapterId: firstChapter.id,
														provider: providerId,
														mangaId: details.id,
														chapterTitle: firstChapter.title,
														mangaTitle: details.title,
													},
												}
											: undefined
									}
								/>
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
								<Pressable className="bg-card/70 border-border/30 rounded-control items-center justify-center border p-3.5" onPress={handleShare}>
									<Ionicons name="share-outline" size={20} color={themeColors.foreground} />
								</Pressable>
							</View>

							{/* Description */}
							{details.description ? (
								<View style={{ marginTop: 16 }}>
									<Text className="text-foreground text-preset-2 font-body leading-relaxed" numberOfLines={descExpanded ? undefined : 4}>
										{details.description}
									</Text>
									{details.description.length > 150 ? (
										<Pressable onPress={() => setDescExpanded(!descExpanded)}>
											<Text className="text-primary text-preset-1 font-heading mt-1 text-right font-semibold">{descExpanded ? 'Less' : 'More'}</Text>
										</Pressable>
									) : null}
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
							<View
								style={{
									marginTop: 24,
									borderTopWidth: 1,
									borderTopColor: chapterBorderColor,
									paddingTop: 16,
								}}
							>
								<Text className="text-foreground text-preset-3 font-heading font-semibold">{chapters.length} Chapters</Text>
								{chapters.length === 0 ? (
									<Text className="text-muted text-preset-1 font-body" style={{ marginTop: 12 }}>
										No chapters available.
									</Text>
								) : (
									<View style={{ marginTop: 4 }}>
										{sortedChapters.map((chapter) => (
											<ChapterRow
												key={chapter.id}
												chapter={chapter}
												borderColor={chapterBorderColor}
												foregroundColor={themeColors.foreground}
												mutedColor={themeColors.muted}
												onPress={() => navigateToChapter(chapter)}
											/>
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
