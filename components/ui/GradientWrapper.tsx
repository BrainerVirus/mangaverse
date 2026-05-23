import { PlatformInfo } from '@lib/platform';
import { type ReactNode } from 'react';
import { View } from 'react-native';

interface GradientWrapperProps {
	children?: ReactNode;
	className?: string;
	colors: string[];
	start?: { x: number; y: number };
	end?: { x: number; y: number };
	locations?: number[];
}

function buildGradientString(colors: string[], start = { x: 0, y: 0 }, end = { x: 0, y: 1 }, locations?: number[]): string {
	const locStr = locations ? locations.map((l, i) => `${colors[i]} ${l * 100}%`).join(', ') : colors.join(', ');
	return `linear-gradient(${end.x * 100}deg ${end.y * 100}%, ${locStr})`;
}

export default function GradientWrapper({ children, className = '', colors, start, end, locations }: GradientWrapperProps) {
	if (PlatformInfo.isWeb) {
		return (
			<View className={`absolute inset-0 ${className}`} style={{ backgroundImage: buildGradientString(colors, start, end, locations) } as never}>
				{children}
			</View>
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { LinearGradient } = require('expo-linear-gradient');
	return (
		<View className={`absolute inset-0 overflow-hidden ${className}`}>
			<LinearGradient colors={colors} start={start ?? { x: 0, y: 0 }} end={end ?? { x: 0, y: 1 }} locations={locations} className="absolute inset-0">
				{children}
			</LinearGradient>
		</View>
	);
}
