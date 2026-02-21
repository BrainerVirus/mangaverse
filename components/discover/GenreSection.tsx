import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GenreCard } from '@components/ui/GenreCard';
import { SkeletonCard } from '@components/ui/SkeletonCard';

import type { ProviderMangaItem } from '../../types/provider';

interface GenreSectionProps {
	items: ProviderMangaItem[];
	providerId?: string;
	pagePadding: number;
	gap: number;
	cardWidth: number;
	peek: number;
	isLoading?: boolean;
	sectionTitle: string;
	focusedKey: string | null;
	onFocus: (key: string | null) => void;
	onScroll: (event: {
		nativeEvent: {
			layoutMeasurement: { width: number };
			contentOffset: { x: number };
			contentSize: { width: number };
		};
	}) => void;
}

export function GenreSection({
	items,
	providerId,
	pagePadding,
	gap,
	cardWidth,
	peek,
	isLoading,
	sectionTitle,
	focusedKey,
	onFocus,
	onScroll,
}: GenreSectionProps) {
	const router = useRouter();

	const handlePressIn = useCallback(
		(item: ProviderMangaItem) => {
			const key = `genre-${item.id}`;
			if (focusedKey !== key) {
				onFocus(key);
			}
		},
		[focusedKey, onFocus],
	);

	const handlePress = useCallback(
		(item: ProviderMangaItem) => {
			onFocus(null);
			router.push({
				pathname: '/discover/[sectionId]',
				params: {
					sectionId: item.id,
					provider: providerId,
					title: item.title,
				},
			});
		},
		[onFocus, providerId, router],
	);

	return (
		<View>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground text-preset-2 font-heading font-semibold">{sectionTitle}</Text>
				<Pressable
					className="bg-primary rounded-control h-11 w-11 items-center justify-center"
					onPress={() =>
						router.push({
							pathname: '/discover/[sectionId]',
							params: {
								sectionId: 'genres',
								provider: providerId,
								title: sectionTitle,
							},
						})
					}
				>
					<Text className="text-primary-foreground text-preset-2 font-body">↗</Text>
				</Pressable>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginHorizontal: -pagePadding, marginTop: -16, marginBottom: -24 }}
				contentContainerStyle={{
					paddingTop: 24,
					paddingBottom: 24,
					paddingLeft: pagePadding,
					paddingRight: pagePadding + peek,
					columnGap: gap,
				}}
				scrollEventThrottle={120}
				onScroll={onScroll}
			>
				{items.map((item, index) => (
					<Pressable key={`genre-${item.id}-${index}`} onPressIn={() => handlePressIn(item)} onPress={() => handlePress(item)}>
						<GenreCard label={item.title} width={cardWidth} focused={focusedKey === `genre-${item.id}`} />
					</Pressable>
				))}
				{isLoading ? [0, 1].map((index) => <SkeletonCard key={`genre-skeleton-${index}`} width={cardWidth} height={88} />) : null}
			</ScrollView>
		</View>
	);
}
