import { Link } from 'expo-router';
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
	onScroll: (event: {
		nativeEvent: {
			layoutMeasurement: { width: number };
			contentOffset: { x: number };
			contentSize: { width: number };
		};
	}) => void;
}

export function GenreSection({ items, providerId, pagePadding, gap, cardWidth, peek, isLoading, sectionTitle, onScroll }: GenreSectionProps) {
	return (
		<View>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground text-preset-2 font-heading font-semibold">{sectionTitle}</Text>
				<Link
					href={{
						pathname: '/discover/[sectionId]',
						params: {
							sectionId: 'genres',
							provider: providerId,
							title: sectionTitle,
						},
					}}
					asChild
				>
					<Pressable className="bg-primary rounded-control h-11 w-11 items-center justify-center">
						<Text className="text-primary-foreground text-preset-2 font-body">↗</Text>
					</Pressable>
				</Link>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginHorizontal: -pagePadding }}
				contentContainerStyle={{
					paddingTop: 8,
					paddingLeft: pagePadding,
					paddingRight: pagePadding + peek,
					columnGap: gap,
				}}
				scrollEventThrottle={120}
				onScroll={onScroll}
			>
				{items.map((item, index) => {
					return (
						<Link
							key={`genre-${item.id}-${index}`}
							href={{
								pathname: '/discover/[sectionId]',
								params: {
									sectionId: item.id,
									provider: providerId,
									title: item.title,
								},
							}}
							asChild
						>
							<Pressable>
								<GenreCard label={item.title} width={cardWidth} />
							</Pressable>
						</Link>
					);
				})}
				{isLoading ? [0, 1].map((index) => <SkeletonCard key={`genre-skeleton-${index}`} width={cardWidth} height={88} />) : null}
			</ScrollView>
		</View>
	);
}
