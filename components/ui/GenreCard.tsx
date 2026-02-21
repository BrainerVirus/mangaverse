import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useThemeColors } from '@lib/themes/vars';

interface GenreCardProps {
	label: string;
	width: number;
	focused?: boolean;
}

export function GenreCard({ label, width, focused = false }: GenreCardProps) {
	const { primary } = useThemeColors();
	const scale = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		Animated.timing(scale, {
			toValue: focused ? 1.06 : 1,
			duration: 150,
			easing: Easing.out(Easing.ease),
			useNativeDriver: true,
		}).start();
	}, [focused, scale]);

	return (
		<Animated.View
			style={{
				width,
				transform: [{ scale }],
				zIndex: focused ? 10 : 0,
				borderRadius: 16,
				shadowColor: focused ? primary : 'transparent',
				shadowOffset: { width: 0, height: 0 },
				shadowOpacity: focused ? 0.5 : 0,
				shadowRadius: focused ? 12 : 0,
				elevation: focused ? 8 : 0,
			}}
		>
			<View className="bg-primary/15 rounded-control h-22 overflow-hidden px-4 py-3">
				<View className="bg-foreground/15 rounded-bl-control absolute top-0 right-0 h-8 w-10 items-center justify-center">
					<Text className="text-preset-2 text-primary font-body">→</Text>
				</View>
				<View className="flex-1 justify-end pr-9">
					<Text className="text-preset-1 font-heading text-foreground font-semibold" numberOfLines={1}>
						{label}
					</Text>
				</View>
			</View>
		</Animated.View>
	);
}
