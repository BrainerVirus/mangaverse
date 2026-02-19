import { Image, Text, View } from 'react-native';

interface MangaCardProps {
	title: string;
	coverUrl?: string;
	subtitle?: string;
	tags?: string[];
	lastChapter?: string | number;
	language?: string;
	inLibrary?: boolean;
	showMeta?: boolean;
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

export function MangaCard({ title, coverUrl, subtitle, lastChapter, language, inLibrary, showMeta = true }: MangaCardProps) {
	const languageLabel = formatLanguage(language);
	const chapterLabel = lastChapter !== undefined && lastChapter !== null && String(lastChapter).length > 0 ? `Ch. ${lastChapter}` : undefined;
	return (
		<View>
			<View className="relative">
				<View className="bg-card overflow-hidden rounded-lg">
					{coverUrl ? (
						<Image source={{ uri: coverUrl }} className="aspect-3/4 w-full" resizeMode="cover" />
					) : (
						<View className="bg-card aspect-3/4 w-full" />
					)}

					{languageLabel && (
						<View className="absolute right-2 bottom-2 rounded-full bg-background/85 px-2 py-1">
							<Text className="text-preset-1 font-body text-foreground">{languageLabel}</Text>
						</View>
					)}
				</View>

				{inLibrary && (
					<View className="bg-primary absolute -top-2 -right-2 h-7 w-7 items-center justify-center rounded-full shadow-sm" style={{ elevation: 3 }}>
						<Text className="text-preset-1 font-body text-primary-foreground">★</Text>
					</View>
				)}
			</View>

			<Text className="text-foreground text-preset-2 font-heading font-semibold mt-1.5" numberOfLines={1}>
				{title}
			</Text>

			{showMeta && (subtitle || chapterLabel) && (
				<Text className="text-muted text-preset-1 font-body" numberOfLines={1}>
					{subtitle && `${subtitle} · `}
					{chapterLabel ?? ''}
				</Text>
			)}
		</View>
	);
}
