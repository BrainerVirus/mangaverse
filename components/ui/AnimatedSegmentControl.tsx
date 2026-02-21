import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { useThemeColors } from '@lib/themes/vars';

export function AnimatedSegmentControl({
	options,
	value,
	onSelect,
	activeTextColor,
	inactiveTextColor,
}: {
	options: { id: string; label: string }[];
	value: string;
	onSelect: (id: string) => void;
	activeTextColor?: string;
	inactiveTextColor?: string;
}) {
	const themeColors = useThemeColors();
	const resolvedActiveColor = activeTextColor ?? themeColors.primaryForeground;
	const resolvedInactiveColor = inactiveTextColor ?? themeColors.mutedForeground;

	const activeIndex = options.findIndex((o) => o.id === value);
	const indicatorX = useRef(new Animated.Value(0)).current;
	const [segmentWidth, setSegmentWidth] = useState(0);

	useEffect(() => {
		if (segmentWidth > 0) {
			Animated.spring(indicatorX, {
				toValue: activeIndex * segmentWidth,
				useNativeDriver: true,
				damping: 20,
				stiffness: 280,
				mass: 0.8,
			}).start();
		}
	}, [activeIndex, segmentWidth, indicatorX]);

	const handleLayout = useCallback(
		(e: { nativeEvent: { layout: { width: number } } }) => {
			const w = Math.round(e.nativeEvent.layout.width / options.length - 2 / options.length);
			setSegmentWidth((prev) => (prev === w ? prev : w));
		},
		[options.length],
	);

	const getActiveOpacity = (index: number) => {
		if (segmentWidth <= 0) return index === activeIndex ? 1 : 0;
		return indicatorX.interpolate({
			inputRange: [(index - 1) * segmentWidth, index * segmentWidth, (index + 1) * segmentWidth],
			outputRange: [0, 1, 0],
			extrapolate: 'clamp',
		});
	};

	const getInactiveOpacity = (index: number) => {
		if (segmentWidth <= 0) return index === activeIndex ? 0 : 1;
		return indicatorX.interpolate({
			inputRange: [(index - 1) * segmentWidth, index * segmentWidth, (index + 1) * segmentWidth],
			outputRange: [1, 0, 1],
			extrapolate: 'clamp',
		});
	};

	return (
		<View className="flex-row overflow-hidden rounded-lg p-1" style={{ backgroundColor: 'rgba(120,120,128,0.16)' }} onLayout={handleLayout}>
			{segmentWidth > 0 && (
				<Animated.View
					className="bg-primary absolute top-1 bottom-1 rounded-md"
					style={{
						width: segmentWidth,
						left: 1,
						transform: [{ translateX: indicatorX }],
					}}
				/>
			)}
			{options.map((opt, i) => (
				<Pressable
					key={opt.id}
					onPress={() => onSelect(opt.id)}
					className="flex-1 items-center justify-center rounded-md py-2.5"
					style={{ zIndex: 1 }}
				>
					<View>
						<Animated.Text
							style={{
								color: resolvedInactiveColor,
								opacity: getInactiveOpacity(i),
								fontWeight: '600',
								textAlign: 'center',
							}}
							className="text-preset-2 font-heading"
						>
							{opt.label}
						</Animated.Text>
						<Animated.Text
							style={{
								color: resolvedActiveColor,
								opacity: getActiveOpacity(i),
								fontWeight: '600',
								position: 'absolute',
								top: 0,
								left: 0,
								right: 0,
								textAlign: 'center',
							}}
							className="text-preset-2 font-heading"
						>
							{opt.label}
						</Animated.Text>
					</View>
				</Pressable>
			))}
		</View>
	);
}
