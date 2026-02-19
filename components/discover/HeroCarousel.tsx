import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { HeroParallaxImage } from '@components/discover/HeroParallaxImage';
import { Button } from '@components/ui/Button';
import { withAlpha } from '@lib/colors/hex';
import { useThemeColors } from '@lib/themes/vars';

import type { ProviderMangaItem } from '../../types/provider';

interface HeroCarouselProps {
	heroItems: ProviderMangaItem[];
	heroWidth: number;
	heroSpacing: number;
	pagePadding: number;
	peek: number;
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
	pagePadding,
	peek,
	heroScrollX,
	heroScrollRef,
	selectedProviderId,
	onToggleFavorite,
	isFavorite,
}: HeroCarouselProps) {
	const heroHeight = 224;
	const themeColors = useThemeColors();
	const overlayStart = withAlpha(themeColors.overlay, 0);
	const overlayMid = withAlpha(themeColors.overlay, 0.22);
	const overlayEnd = withAlpha(themeColors.overlay, 0.72);

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
				style={{ marginHorizontal: -pagePadding }}
				contentContainerStyle={{
					paddingHorizontal: pagePadding + Math.round(peek / 2),
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
							<View className="relative" style={{ height: heroHeight }}>
								<Link
									href={{
										pathname: '/manga/[id]',
										params: { id: item.id, provider: selectedProviderId },
									}}
									asChild
								>
									<Pressable style={{ height: heroHeight }}>
										{item.coverUrl ? (
											<HeroParallaxImage imageUri={item.coverUrl} height={heroHeight} />
										) : (
											<View className="bg-card" style={{ height: heroHeight, width: '100%' }} />
										)}
										<LinearGradient
											colors={[overlayStart, overlayMid, overlayEnd]}
											locations={[0, 0.58, 1]}
											style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
										/>
									</Pressable>
								</Link>
								<View className="absolute inset-x-0 bottom-3 px-4" pointerEvents="box-none">
									<View className="flex-row gap-3">
										<Button
											label={isItemFavorite ? 'In Library' : 'Add to Library'}
											variant="primary"
											size="sm"
											className="h-10 flex-1"
											onPress={() => onToggleFavorite(item)}
										/>
										<Link
											href={{
												pathname: '/manga/[id]',
												params: { id: item.id, provider: selectedProviderId },
											}}
											asChild
										>
											<Pressable className="h-10 flex-1 items-center justify-center rounded-full border-2 border-foreground/40 bg-background/20">
												<Text className="text-preset-1 font-heading font-semibold text-foreground">Read Now</Text>
											</Pressable>
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
