import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SkeletonCard } from '@components/ui/SkeletonCard';

import type { ProviderMangaItem } from '../types/provider';

interface HorizontalSectionProps {
	sectionId: string;
	title: string;
	items: ProviderMangaItem[];
	providerId?: string;
	pagePadding: number;
	gap: number;
	cardWidth: number;
	peek: number;
	isLoading?: boolean;
	renderItem: (item: ProviderMangaItem, index: number) => React.ReactNode;
	seeAllVariant?: 'primary' | 'ghost';
	onScroll?: (event: {
		nativeEvent: {
			layoutMeasurement: { width: number };
			contentOffset: { x: number };
			contentSize: { width: number };
		};
	}) => void;
}

export function HorizontalSection({
	sectionId,
	title,
	items,
	providerId,
	pagePadding,
	gap,
	cardWidth,
	peek,
	isLoading,
	renderItem,
	seeAllVariant = 'primary',
	onScroll,
}: HorizontalSectionProps) {
	const router = useRouter();
	const seeAllClassName =
		seeAllVariant === 'primary'
			? 'h-11 w-11 items-center justify-center rounded-control bg-primary'
			: 'h-11 w-11 items-center justify-center rounded-control bg-primary/20';
	return (
		<View>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground text-preset-2 font-heading font-semibold">{title}</Text>
				<Pressable
					className={seeAllClassName}
					onPress={() =>
						router.push({
							pathname: '/discover/[sectionId]',
							params: { sectionId, provider: providerId, title },
						})
					}
				>
					<Text className={seeAllVariant === 'primary' ? 'text-primary-foreground text-preset-2 font-body' : 'text-primary text-preset-2 font-body'}>
						↗
					</Text>
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
					<View key={`${sectionId}-${item.id}-${index}`} style={{ width: cardWidth }}>
						{renderItem(item, index)}
					</View>
				))}
				{isLoading
					? [0, 1].map((index) => (
							<SkeletonCard key={`${sectionId}-skeleton-${index}`} width={cardWidth} height={Math.round(cardWidth * 1.45)} className="mt-1" />
						))
					: null}
			</ScrollView>
		</View>
	);
}
