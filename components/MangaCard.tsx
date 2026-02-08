import { Image, Text, View } from "react-native"

interface MangaCardProps {
	title: string
	coverUrl?: string
	subtitle?: string
}

export function MangaCard({ title, coverUrl, subtitle }: MangaCardProps) {
	return (
		<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-3 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
			<View className="overflow-hidden rounded-[22px] bg-neutral-800">
				{coverUrl ? (
					<Image source={{ uri: coverUrl }} className="h-44 w-full" resizeMode="cover" />
				) : (
					<View className="h-44 w-full bg-neutral-800" />
				)}
			</View>
			<Text className="mt-3 text-sm font-semibold text-white" numberOfLines={2}>
				{title}
			</Text>
			{subtitle ? (
				<Text className="mt-1 text-xs text-neutral-400" numberOfLines={1}>
					{subtitle}
				</Text>
			) : null}
		</View>
	)
}
