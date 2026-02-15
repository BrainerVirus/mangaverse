import { Link } from "expo-router"
import { ArrowRight, ArrowUpRight } from "lucide-react-native"
import { Pressable, ScrollView, Text, View } from "react-native"

import { Icon } from "@components/Icon"

import { GENRE_COLORS } from "@lib/discover"

import type { ProviderMangaItem } from "../../types/provider"

interface GenreSectionProps {
	items: ProviderMangaItem[]
	providerId?: string
	pagePadding: number
	gap: number
	cardWidth: number
	sectionTitle: string
	onScroll: (event: {
		nativeEvent: {
			layoutMeasurement: { width: number }
			contentOffset: { x: number }
			contentSize: { width: number }
		}
	}) => void
}

export function GenreSection({
	items,
	providerId,
	pagePadding,
	gap,
	cardWidth,
	sectionTitle,
	onScroll,
}: GenreSectionProps) {
	return (
		<View>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground text-lg font-semibold">{sectionTitle}</Text>
				<Link
					href={{
						pathname: "/discover/[sectionId]",
						params: {
							sectionId: "genres",
							provider: providerId,
							title: sectionTitle,
						},
					}}
					className="bg-accent h-11 w-11 items-center justify-center rounded-2xl"
				>
					<Icon icon={ArrowUpRight} size={18} color="#120b0b" />
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
				{items.map((item, index) => {
					const color = GENRE_COLORS[index % GENRE_COLORS.length]
					return (
						<Link
							key={`genre-${item.id}-${index}`}
							href={{
								pathname: "/discover/[sectionId]",
								params: {
									sectionId: item.id,
									provider: providerId,
									title: item.title,
								},
							}}
							asChild
						>
							<Pressable
								style={{ backgroundColor: color, width: cardWidth }}
								className="h-18 overflow-hidden rounded-[18px] px-4 py-3"
							>
								<View className="absolute top-0 right-0 h-12 w-12 rounded-bl-3xl bg-white/30" />
								<View className="absolute top-2 right-3 h-7 w-7 items-center justify-center rounded-full bg-white/40">
									<Icon icon={ArrowRight} size={12} color="#ffffff" />
								</View>
								<Text className="text-sm font-semibold text-white" numberOfLines={2}>
									{item.title}
								</Text>
							</Pressable>
						</Link>
					)
				})}
			</ScrollView>
		</View>
	)
}
