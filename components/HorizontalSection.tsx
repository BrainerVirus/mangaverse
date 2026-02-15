import { Link } from "expo-router"
import { ArrowUpRight } from "lucide-react-native"
import { ScrollView, Text, View } from "react-native"

import { Icon } from "@components/Icon"

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
	onScroll?: (event: {
		nativeEvent: {
			layoutMeasurement: { width: number }
			contentOffset: { x: number }
			contentSize: { width: number }
		}
	}) => void
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
	onScroll,
}: HorizontalSectionProps) {
	const seeAllClassName =
		seeAllVariant === "primary"
			? "h-11 w-11 items-center justify-center rounded-[16px] bg-accent"
			: "h-11 w-11 items-center justify-center rounded-[16px] bg-accent/20"
	return (
		<View>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground text-lg font-semibold">{title}</Text>
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
					<Icon
						icon={ArrowUpRight}
						size={18}
						color={seeAllVariant === "primary" ? "#120b0b" : "#ff6b6b"}
					/>
				</Link>
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				className="mt-4"
				contentContainerStyle={{ paddingRight: pagePadding, columnGap: gap }}
				scrollEventThrottle={120}
				onScroll={onScroll}
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
