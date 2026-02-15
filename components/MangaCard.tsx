import { Bookmark } from "lucide-react-native"
import { Image, Text, View } from "react-native"

import { Icon } from "@components/Icon"

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
	lastChapter,
	language,
	inLibrary,
	showMeta = true,
}: MangaCardProps) {
	const languageLabel = formatLanguage(language)
	const chapterLabel =
		lastChapter !== undefined && lastChapter !== null && String(lastChapter).length > 0
			? `Ch. ${lastChapter}`
			: undefined
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
						<View className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-1">
							<Text className="text-[10px] text-white">{languageLabel}</Text>
						</View>
					)}
				</View>

				{inLibrary && (
					<View
						className="bg-accent will-change-variable absolute -top-2 -right-2 h-7 w-7 items-center justify-center rounded-full shadow-sm"
						style={{ elevation: 3 }} // Add elevation for Android so it sits "above"
					>
						<Icon icon={Bookmark} size={12} color="#120b0b" fill="#120b0b" />
					</View>
				)}
			</View>

			<Text className="text-foreground mt-2 text-sm font-semibold" numberOfLines={1}>
				{title}
			</Text>

			{showMeta && (subtitle || chapterLabel) && (
				<Text className="text-muted mt-1 text-xs" numberOfLines={1}>
					{subtitle && `${subtitle} · `}
					{chapterLabel ?? ""}
				</Text>
			)}
		</View>
	)
}
