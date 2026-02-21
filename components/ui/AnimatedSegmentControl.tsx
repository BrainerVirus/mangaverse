import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

export function AnimatedSegmentControl({
	options,
	value,
	onSelect,
}: {
	options: { id: string; label: string }[];
	value: string;
	onSelect: (id: string) => void;
}) {
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
			{options.map((opt) => (
				<Pressable key={opt.id} onPress={() => onSelect(opt.id)} className="flex-1 items-center rounded-md py-2.5" style={{ zIndex: 1 }}>
					<Text className={`text-preset-2 font-heading font-semibold ${opt.id === value ? 'text-primary-foreground' : 'text-muted'}`}>
						{opt.label}
					</Text>
				</Pressable>
			))}
		</View>
	);
}
