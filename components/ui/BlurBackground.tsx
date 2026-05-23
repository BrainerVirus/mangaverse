import { PlatformInfo } from '@lib/platform';
import { type ReactNode } from 'react';
import { View } from 'react-native';

interface BlurBackgroundProps {
	children?: ReactNode;
	className?: string;
	intensity?: number;
}

export default function BlurBackground({ children, className = '', intensity = 60 }: BlurBackgroundProps) {
	if (PlatformInfo.isWeb) {
		const blurValue = Math.round((intensity / 100) * 40);
		return (
			<View
				className={`pointer-events-none absolute inset-0 ${className}`}
				style={
					{
						WebkitBackdropFilter: `blur(${blurValue}px)`,
						backdropFilter: `blur(${blurValue}px)`,
					} as never
				}
			>
				{children}
			</View>
		);
	}

	if (PlatformInfo.isIOS) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { BlurView } = require('expo-blur');
		return (
			<BlurView intensity={intensity} tint="systemChromeMaterialDark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
				{children}
			</BlurView>
		);
	}

	const alpha = (intensity / 100) * 0.9;
	return (
		<View className={`pointer-events-none absolute inset-0 ${className}`} style={{ backgroundColor: `rgba(0,0,0,${alpha})` }}>
			{children}
		</View>
	);
}
