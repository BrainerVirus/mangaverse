import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';

import { useThemeColors } from '@lib/themes/vars';

interface MangaCardProps {
	title: string;
	coverUrl?: string;
	subtitle?: string;
	tags?: string[];
	lastChapter?: string | number;
	language?: string;
	inLibrary?: boolean;
	showMeta?: boolean;
	focused?: boolean;
	unreadCount?: number;
	titleLines?: number;
}

const languageToFlag: Record<string, string> = {
	en: '🇺🇸',
	es: '🇪🇸',
	jp: '🇯🇵',
	ja: '🇯🇵',
	pt: '🇵🇹',
	fr: '🇫🇷',
	de: '🇩🇪',
	it: '🇮🇹',
	ru: '🇷🇺',
	ko: '🇰🇷',
	zh: '🇨🇳',
};

const formatLanguage = (value?: string) => {
	if (!value) {
		return undefined;
	}
	const normalized = value.toLowerCase();
	const flag = languageToFlag[normalized];
	if (flag) {
		return flag;
	}
	return normalized.slice(0, 2).toUpperCase();
};

export function MangaCard({
	title,
	coverUrl,
	subtitle,
	lastChapter,
	language,
	inLibrary,
	showMeta = true,
	focused = false,
	unreadCount,
	titleLines = 1,
}: MangaCardProps) {
	const { primary, error: errorColor } = useThemeColors();
	const scale = useRef(new Animated.Value(1)).current;
	const languageLabel = formatLanguage(language);
	const chapterLabel = lastChapter !== undefined && lastChapter !== null && String(lastChapter).length > 0 ? `Ch. ${lastChapter}` : undefined;

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
			<View>
				<View className="relative">
					<View className="bg-card rounded-btn overflow-hidden">
						{coverUrl ? (
							<Image source={{ uri: coverUrl }} className="aspect-3/4 w-full" resizeMode="cover" />
						) : (
							<View className="bg-card aspect-3/4 w-full" />
						)}

						{languageLabel && (
							<View className="bg-background/85 rounded-badge absolute right-2 bottom-2 px-2 py-1">
								<Text className="text-preset-1 font-body text-foreground">{languageLabel}</Text>
							</View>
						)}
					</View>

					{inLibrary && !unreadCount && (
						<View
							className="bg-primary rounded-badge absolute -top-2 -right-2 h-7 w-7 items-center justify-center shadow-sm"
							style={{ elevation: 3 }}
						>
							<Text className="text-preset-1 font-body text-primary-foreground">★</Text>
						</View>
					)}

					{unreadCount !== undefined && unreadCount > 0 && (
						<View
							className="rounded-badge absolute -top-1 -right-1 min-w-7 items-center justify-center px-1.5 py-0.5 shadow-sm"
							style={{ backgroundColor: errorColor, elevation: 4 }}
						>
							<Text className="text-center font-semibold text-white" style={{ fontSize: 12, lineHeight: 16 }}>
								{unreadCount}
							</Text>
						</View>
					)}
				</View>

				<Text className="text-foreground text-preset-2 font-heading mt-1.5 font-semibold" numberOfLines={titleLines}>
					{title}
				</Text>

				{showMeta && (subtitle || chapterLabel) && (
					<Text className="text-muted text-preset-1 font-body" numberOfLines={1}>
						{subtitle && `${subtitle} · `}
						{chapterLabel ?? ''}
					</Text>
				)}
			</View>
		</Animated.View>
	);
}
