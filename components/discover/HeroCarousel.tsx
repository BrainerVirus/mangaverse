import GradientWrapper from '@components/ui/GradientWrapper';
import { useRouter } from 'expo-router';
import { Animated, Pressable, ScrollView, View } from 'react-native';

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
	const router = useRouter();
	const overlayStart = withAlpha(themeColors.overlay, 0);
	const overlayMid = withAlpha(themeColors.overlay, 0.38);
	const overlayEnd = withAlpha(themeColors.overlay, 0.85);

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
					paddingLeft: pagePadding,
					paddingRight: pagePadding + peek,
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
						<View key={`${item.id}-${index}`} style={{ width: heroWidth }} className="bg-card rounded-box overflow-hidden">
							<View className="relative" style={{ height: heroHeight }}>
								<Pressable
									style={{ height: heroHeight }}
									onPress={() => router.push({ pathname: '/manga/[id]', params: { id: item.id, provider: selectedProviderId } })}
								>
									{item.coverUrl ? (
										<HeroParallaxImage imageUri={item.coverUrl} height={heroHeight} />
									) : (
										<View className="bg-card" style={{ height: heroHeight, width: '100%' }} />
									)}
									<GradientWrapper colors={[overlayStart, overlayMid, overlayEnd]} locations={[0, 0.58, 1]} />
								</Pressable>
								<View className="absolute inset-x-0 bottom-3 px-4" style={{ pointerEvents: 'box-none' }}>
									<View className="flex-row gap-3">
										<Button
											label={isItemFavorite ? 'In Library' : 'Add to Library'}
											variant="primary"
											size="sm"
											className="h-10 flex-1"
											onPress={() => onToggleFavorite(item)}
										/>
										<Button
											label="Read Now"
											variant="primary"
											outline
											size="sm"
											className="h-10 flex-1"
											href={{
												pathname: '/manga/[id]',
												params: { id: item.id, provider: selectedProviderId },
											}}
										/>
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
