import { PlatformInfo } from '@lib/platform';
import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SafeAreaWrapperProps {
	children: ReactNode;
	className?: string;
}

export default function SafeAreaWrapper({ children, className = '' }: SafeAreaWrapperProps) {
	const insets = useSafeAreaInsets();

	if (PlatformInfo.isWeb) {
		return (
			<View
				className={`flex-1 ${className}`}
				style={
					{
						paddingTop: 'max(env(safe-area-inset-top), 16px)',
						paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
						paddingLeft: 'max(env(safe-area-inset-left), 0px)',
						paddingRight: 'max(env(safe-area-inset-right), 0px)',
					} as never
				}
			>
				{children}
			</View>
		);
	}

	return (
		<View
			className={`flex-1 ${className}`}
			style={{
				paddingTop: insets.top,
				paddingBottom: insets.bottom,
				paddingLeft: insets.left,
				paddingRight: insets.right,
			}}
		>
			{children}
		</View>
	);
}

export function useSafeAreaPadding() {
	const insets = useSafeAreaInsets();

	if (PlatformInfo.isWeb) {
		return {
			paddingTop: 'max(env(safe-area-inset-top), 16px)' as never,
			paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' as never,
		};
	}
	return {
		paddingTop: insets.top,
		paddingBottom: insets.bottom,
	};
}
