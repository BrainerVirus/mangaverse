import { Animated } from 'react-native';

import { usePulseAnimation } from '@hooks/usePulseAnimation';

interface SkeletonCardProps {
	width: number;
	height: number;
	className?: string;
}

export function SkeletonCard({ width, height, className }: SkeletonCardProps) {
	const { animatedStyle } = usePulseAnimation();
	return <Animated.View style={[{ width, height }, animatedStyle]} className={`bg-card rounded-[18px] ${className ?? ''}`} />;
}
