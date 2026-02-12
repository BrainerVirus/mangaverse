import { Image, ScrollView, Text, View } from "react-native"

interface MangaCardProps {
	title: string
	coverUrl?: string
	subtitle?: string
	tags?: string[]
	lastChapter?: string | number
	language?: string
	inLibrary?: boolean
	showMeta?: boolean
}

const languageToFlag: Record<string, string> = {
	en: "🇺🇸",
	es: "🇪🇸",
	jp: "🇯🇵",
	ja: "🇯🇵",
	pt: "🇵🇹",
	fr: "🇫🇷",
	de: "🇩🇪",
	it: "🇮🇹",
	ru: "🇷🇺",
	ko: "🇰🇷",
	zh: "🇨🇳",
}

const formatLanguage = (value?: string) => {
	if (!value) {
		return undefined
	}
	const normalized = value.toLowerCase()
	const flag = languageToFlag[normalized]
	if (flag) {
		return flag
	}
	return normalized.slice(0, 2).toUpperCase()
}

export function MangaCard({
	title,
	coverUrl,
	subtitle,
	tags,
	lastChapter,
	language,
	inLibrary,
	showMeta = true,
}: MangaCardProps) {
	const languageLabel = formatLanguage(language)
	const hasTags = Boolean(tags?.length)
	const chapterLabel =
		lastChapter !== undefined && lastChapter !== null && String(lastChapter).length > 0
			? `Ch. ${lastChapter}`
			: undefined
	return (
		<View>
			<View className="bg-card relative overflow-hidden rounded-[18px]">
				{coverUrl ? (
					<Image
						source={{ uri: coverUrl }}
						className="w-full"
						style={{ aspectRatio: 3 / 4 }}
						resizeMode="cover"
					/>
				) : (
					<View className="bg-card w-full" style={{ aspectRatio: 3 / 4 }} />
				)}
				{inLibrary ? (
					<View className="absolute top-2 right-2 h-7 w-7 items-center justify-center rounded-full bg-black/70">
						<Text className="text-accent text-xs">🔖</Text>
					</View>
				) : null}
				{languageLabel ? (
					<View className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-1">
						<Text className="text-[10px] text-white">{languageLabel}</Text>
					</View>
				) : null}
			</View>
			<Text className="text-foreground mt-2 text-sm font-semibold" numberOfLines={2}>
				{title}
			</Text>
			{showMeta && hasTags ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
					<View className="flex-row gap-2">
						{tags?.map((tag, index) => (
							<View key={`${tag}-${index}`} className="bg-accent/20 rounded-full px-2 py-1">
								<Text className="text-accent text-[10px] font-semibold" numberOfLines={1}>
									{tag}
								</Text>
							</View>
						))}
					</View>
				</ScrollView>
			) : null}
			{showMeta && (subtitle || chapterLabel) ? (
				<Text className="text-muted mt-1 text-xs" numberOfLines={1}>
					{subtitle ? subtitle : null}
					{subtitle && chapterLabel ? " · " : ""}
					{chapterLabel ?? ""}
				</Text>
			) : null}
		</View>
	)
}
