import { Link } from "expo-router"
import { ScrollView, Text, View } from "react-native"

import type { ProviderMangaItem } from "../types/provider"

interface HorizontalSectionProps {
	sectionId: string
	title: string
	items: ProviderMangaItem[]
	providerId?: string
	pagePadding: number
	gap: number
	cardWidth: number
	renderItem: (item: ProviderMangaItem, index: number) => React.ReactNode
 	seeAllVariant?: "primary" | "ghost"
}

export function HorizontalSection({
	sectionId,
	title,
	items,
	providerId,
	pagePadding,
	gap,
	cardWidth,
	renderItem,
	seeAllVariant = "primary",
}: HorizontalSectionProps) {
	const seeAllClassName =
		seeAllVariant === "primary"
			? "h-11 w-11 items-center justify-center rounded-[16px] bg-accent"
			: "h-11 w-11 items-center justify-center rounded-[16px] bg-accent/20"
	const seeAllTextClassName = seeAllVariant === "primary" ? "text-base text-accent-foreground" : "text-base text-accent"
	return (
		<View>
			<View className="flex-row items-center justify-between">
				<Text className="text-lg font-semibold text-foreground">{title}</Text>
				<Link
					href={{
						pathname: "/discover/[sectionId]",
						params: {
							sectionId,
							provider: providerId,
							title,
						},
					}}
					className={seeAllClassName}
				>
					<Text className={seeAllTextClassName}>↗</Text>
				</Link>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				className="mt-4"
				contentContainerStyle={{ paddingHorizontal: pagePadding, columnGap: gap }}
				scrollEventThrottle={120}
			>
				{items.map((item, index) => (
					<View key={`${sectionId}-${item.id}-${index}`} style={{ width: cardWidth }}>
						{renderItem(item, index)}
					</View>
				))}
			</ScrollView>
		</View>
	)
}
