import { Image, Text, View } from "react-native"

interface MangaCardProps {
	title: string
	coverUrl?: string
	subtitle?: string
}

export function MangaCard({ title, coverUrl, subtitle }: MangaCardProps) {
	return (
		<View>
			<View className="relative overflow-hidden rounded-[18px] bg-card">
				{coverUrl ? (
					<Image
						source={{ uri: coverUrl }}
						className="w-full"
						style={{ aspectRatio: 3 / 4 }}
						resizeMode="cover"
					/>
				) : (
					<View className="w-full bg-card" style={{ aspectRatio: 3 / 4 }} />
				)}
			</View>
			<Text className="mt-2 text-sm font-semibold text-foreground" numberOfLines={2}>
				{title}
			</Text>
			{subtitle ? (
				<Text className="mt-1 text-xs text-muted" numberOfLines={1}>
					{subtitle}
				</Text>
			) : null}
		</View>
	)
}
