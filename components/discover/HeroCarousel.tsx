import { Link } from 'expo-router';
import { Animated, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { getHeroSubtitle } from '@lib/discover';

import type { ProviderMangaItem } from '../../types/provider';

interface HeroCarouselProps {
	heroItems: ProviderMangaItem[];
	heroWidth: number;
	heroSpacing: number;
	heroProvider: string;
	pagePadding: number;
	heroScrollX: Animated.Value;
	heroScrollRef: React.RefObject<ScrollView | null>;
	selectedProviderId?: string;
	onToggleFavorite: (item: ProviderMangaItem) => void;
	isFavorite: (item: ProviderMangaItem) => boolean;
}

export function HeroCarousel({
	heroItems,
	heroWidth,
	heroSpacing,
	heroProvider,
	pagePadding,
	heroScrollX,
	heroScrollRef,
	selectedProviderId,
	onToggleFavorite,
	isFavorite,
}: HeroCarouselProps) {
	if (heroItems.length === 0) {
		return null;
	}
	return (
		<View className="mt-6">
			<Animated.ScrollView
				ref={heroScrollRef}
				horizontal
				snapToInterval={heroWidth + heroSpacing}
				decelerationRate="fast"
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{
					paddingRight: pagePadding,
					columnGap: heroSpacing,
				}}
				onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: heroScrollX } } }], {
					useNativeDriver: false,
				})}
				scrollEventThrottle={16}
			>
				{heroItems.map((item, index) => {
					const isItemFavorite = isFavorite(item);
					return (
						<View key={`${item.id}-${index}`} style={{ width: heroWidth }} className="bg-card overflow-hidden rounded-box">
							<View className="relative">
								<Link
									href={{
										pathname: '/manga/[id]',
										params: { id: item.id, provider: selectedProviderId },
									}}
									asChild
								>
									<Pressable>
										{item.coverUrl ? (
											<Image source={{ uri: item.coverUrl }} className="h-56 w-full" resizeMode="cover" />
										) : (
											<View className="bg-card h-56 w-full" />
										)}
										<View className="absolute inset-0 bg-black/40" />
										<View className="absolute inset-x-0 bottom-0 p-4 pb-14">
											<Text className="text-preset-4 font-heading font-semibold text-white" numberOfLines={1}>
												{item.title}
											</Text>
											<Text className="text-preset-2 font-body mt-1 text-white/70" numberOfLines={2}>
												{getHeroSubtitle(item)}
											</Text>
											<Text className="text-preset-1 mt-2 tracking-[0.2em] text-white/60 uppercase">{heroProvider}</Text>
										</View>
									</Pressable>
								</Link>
								<View className="absolute inset-x-0 bottom-3 px-4" pointerEvents="box-none">
									<View className="flex-row gap-3">
										<Pressable onPress={() => onToggleFavorite(item)} className="bg-background/85 flex-1 rounded-full px-4 py-3">
											<Text className="text-accent text-preset-2 font-heading text-center font-semibold">
												{isItemFavorite ? 'In Library' : 'Add to Library'}
											</Text>
										</Pressable>
										<Link
											href={{
												pathname: '/manga/[id]',
												params: { id: item.id, provider: selectedProviderId },
											}}
											className="bg-background/85 flex-1 rounded-full px-4 py-3"
										>
											<Text className="text-accent text-preset-2 font-heading text-center font-semibold">Read Now</Text>
										</Link>
									</View>
								</View>
							</View>
						</View>
					);
				})}
			</Animated.ScrollView>
		</View>
	);
}
