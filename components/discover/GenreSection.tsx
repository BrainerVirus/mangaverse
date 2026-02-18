import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GENRE_COLORS } from '@lib/discover';

import type { ProviderMangaItem } from '../../types/provider';

interface GenreSectionProps {
	items: ProviderMangaItem[];
	providerId?: string;
	pagePadding: number;
	gap: number;
	cardWidth: number;
	sectionTitle: string;
	onScroll: (event: {
		nativeEvent: {
			layoutMeasurement: { width: number };
			contentOffset: { x: number };
			contentSize: { width: number };
		};
	}) => void;
}

export function GenreSection({ items, providerId, pagePadding, gap, cardWidth, sectionTitle, onScroll }: GenreSectionProps) {
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
					className="bg-accent h-11 w-11 items-center justify-center rounded-2xl"
				>
					<Text className="text-accent-foreground text-preset-2 font-body">↗</Text>
				</Link>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				className="mt-4"
				contentContainerStyle={{ paddingRight: pagePadding, columnGap: gap }}
				scrollEventThrottle={120}
				onScroll={onScroll}
			>
				{items.map((item, index) => {
					const color = GENRE_COLORS[index % GENRE_COLORS.length];
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
							<Pressable style={{ backgroundColor: color, width: cardWidth }} className="h-18 overflow-hidden rounded-[18px] px-4 py-3">
								<View className="absolute top-0 right-0 h-12 w-12 rounded-bl-3xl bg-foreground/20" />
								<View className="absolute top-2 right-3 h-7 w-7 items-center justify-center rounded-full bg-foreground/25">
									<Text className="text-preset-1 font-body text-foreground">→</Text>
								</View>
								<Text className="text-preset-1 font-heading font-semibold text-foreground" numberOfLines={2}>
									{item.title}
								</Text>
							</Pressable>
						</Link>
					);
				})}
			</ScrollView>
		</View>
	);
}
