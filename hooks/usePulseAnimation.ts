import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';

interface PulseOptions {
	min?: number;
	max?: number;
	duration?: number;
}

export const usePulseAnimation = ({ min = 0.35, max = 0.85, duration = 900 }: PulseOptions = {}) => {
	const pulse = useRef(new Animated.Value(min)).current;
	const animatedStyle = useMemo(() => ({ opacity: pulse }), [pulse]);

	useEffect(() => {
		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: max,
					duration,
					useNativeDriver: true,
				}),
				Animated.timing(pulse, {
					toValue: min,
					duration,
					useNativeDriver: true,
				}),
			]),
		);
		animation.start();
		return () => animation.stop();
	}, [duration, max, min, pulse]);

	return { pulse, animatedStyle };
};
