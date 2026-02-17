import { useEffect, useMemo, useRef } from 'react';
import { Animated, View } from 'react-native';

interface DiscoverSkeletonProps {
	gap: number;
	cardWidth: number;
	heroWidth: number;
}

export function DiscoverSkeleton({ gap, cardWidth, heroWidth }: DiscoverSkeletonProps) {
	const pulse = useRef(new Animated.Value(0.35)).current;
	const shimmerStyle = useMemo(() => ({ opacity: pulse }), [pulse]);

	useEffect(() => {
		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: 0.85,
					duration: 900,
					useNativeDriver: true,
				}),
				Animated.timing(pulse, {
					toValue: 0.35,
					duration: 900,
					useNativeDriver: true,
				}),
			]),
		);
		animation.start();
		return () => animation.stop();
	}, [pulse]);

	const heroHeight = 224;
	const cardHeight = Math.round(cardWidth * 1.45);
	const sectionTitleWidth = Math.max(140, Math.round(cardWidth * 1.2));

	return (
		<View className="mt-6 gap-6">
			<View>
				<Animated.View style={[{ width: heroWidth, height: heroHeight, borderRadius: 26 }, shimmerStyle]} className="bg-card" />
			</View>
			<View className="gap-5">
				{[0, 1].map((sectionIndex) => (
					<View key={`section-${sectionIndex}`}>
						<View className="flex-row items-center justify-between">
							<Animated.View style={[{ height: 16, width: sectionTitleWidth, borderRadius: 8 }, shimmerStyle]} className="bg-card" />
							<Animated.View style={[{ height: 40, width: 40, borderRadius: 16 }, shimmerStyle]} className="bg-card" />
						</View>
						<View className="mt-4 flex-row" style={{ columnGap: gap }}>
							{[0, 1, 2].map((index) => (
								<Animated.View
									key={`card-${sectionIndex}-${index}`}
									style={[{ width: cardWidth, height: cardHeight, borderRadius: 18 }, shimmerStyle]}
									className="bg-card"
								/>
							))}
						</View>
					</View>
				))}
			</View>
		</View>
	);
}
