import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

const BTN_BG = 'rgba(255,255,255,0.2)';

interface BottomChromeOverlayProps {
	chromeOpacity: Animated.Value;
	chromeVisible: boolean;
	insets: { bottom: number };
	isPaged: boolean;
	lockRotation: boolean;
	pageDisplay: string;
	themeColors: { primary: string };
	chevronButtonLocation: 'left' | 'right';
	settingsButtonLocation: 'left' | 'right';
	onToggleReaderMode: () => void;
	onToggleRotation: () => void;
	onOpenSettings: () => void;
	onPrev: () => void;
	onNext: () => void;
}

export function BottomChromeOverlay({
	chromeOpacity,
	chromeVisible,
	insets,
	isPaged,
	lockRotation,
	pageDisplay,
	themeColors,
	chevronButtonLocation,
	settingsButtonLocation,
	onToggleReaderMode,
	onToggleRotation,
	onOpenSettings,
	onPrev,
	onNext,
}: BottomChromeOverlayProps) {
	const modeRotation = (
		<React.Fragment key="mode-rotation">
			<Pressable
				onPress={onToggleReaderMode}
				className="h-10 w-10 items-center justify-center rounded-full"
				style={{ backgroundColor: BTN_BG }}
				hitSlop={4}
			>
				<Ionicons name={isPaged ? 'swap-vertical' : 'book-outline'} size={20} color="#fff" />
			</Pressable>
			<Pressable
				onPress={onToggleRotation}
				className="h-10 w-10 items-center justify-center rounded-full"
				style={{ backgroundColor: lockRotation ? themeColors.primary : BTN_BG }}
				hitSlop={4}
			>
				<Ionicons name={lockRotation ? 'lock-closed' : 'lock-open-outline'} size={20} color="#fff" />
			</Pressable>
		</React.Fragment>
	);

	const settingsButton = (
		<Pressable
			key="settings"
			onPress={onOpenSettings}
			className="h-10 w-10 items-center justify-center rounded-full"
			style={{ backgroundColor: BTN_BG }}
			hitSlop={4}
		>
			<Ionicons name="settings-sharp" size={20} color="#fff" />
		</Pressable>
	);

	const pagination = (
		<View key="pagination" className="flex-row items-center gap-2">
			<Pressable onPress={onPrev} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: BTN_BG }} hitSlop={4}>
				<Ionicons name="chevron-back" size={20} color="#fff" />
			</Pressable>
			<Text className="text-preset-1 font-body" style={{ color: '#fff', minWidth: 60, textAlign: 'center' }}>
				{pageDisplay}
			</Text>
			<Pressable onPress={onNext} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: BTN_BG }} hitSlop={4}>
				<Ionicons name="chevron-forward" size={20} color="#fff" />
			</Pressable>
		</View>
	);

	const leftItems: React.ReactNode[] = [];
	const rightItems: React.ReactNode[] = [];

	if (chevronButtonLocation === 'left') {
		leftItems.push(pagination);
		rightItems.push(modeRotation);
	} else {
		leftItems.push(modeRotation);
		rightItems.push(pagination);
	}

	if (settingsButtonLocation === 'left') {
		leftItems.push(settingsButton);
	} else {
		rightItems.push(settingsButton);
	}

	return (
		<Animated.View
			className="absolute right-0 bottom-0 left-0"
			style={{ opacity: chromeOpacity, zIndex: chromeVisible ? 20 : -1 }}
			pointerEvents={chromeVisible ? 'auto' : 'none'}
		>
			<LinearGradient
				colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
				style={{ paddingBottom: Math.max(insets.bottom, 12) + 8, paddingTop: 32, paddingHorizontal: 16 }}
			>
				<View className="flex-row items-center justify-between">
					<View className="flex-row items-center gap-3">{leftItems}</View>
					<View className="flex-row items-center gap-3">{rightItems}</View>
				</View>
			</LinearGradient>
		</Animated.View>
	);
}
