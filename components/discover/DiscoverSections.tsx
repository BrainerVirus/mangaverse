import { Link } from "expo-router"
import { Pressable, View } from "react-native"

import { HorizontalSection } from "@components/HorizontalSection"
import { MangaCard } from "@components/MangaCard"
import { GenreSection } from "@components/discover/GenreSection"

import type { ProviderDiscoverSection, ProviderMangaItem } from "../../types/provider"

interface DiscoverSectionsProps {
	sections: ProviderDiscoverSection[]
	sectionItems: Record<string, ProviderMangaItem[]>
	providerId?: string
	pagePadding: number
	gap: number
	cardWidth: number
	onLoadMore: (sectionId: string) => void
	isInLibrary: (itemId: string) => boolean
}

export function DiscoverSections({
	sections,
	sectionItems,
	providerId,
	pagePadding,
	gap,
	cardWidth,
	onLoadMore,
	isInLibrary,
}: DiscoverSectionsProps) {
	const handleHorizontalScroll =
		(sectionId: string) =>
		(event: {
			nativeEvent: {
				layoutMeasurement: { width: number }
				contentOffset: { x: number }
				contentSize: { width: number }
			}
		}) => {
			const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
			const threshold = 120
			if (layoutMeasurement.width + contentOffset.x >= contentSize.width - threshold) {
				onLoadMore(sectionId)
			}
		}

	return (
		<View className="mt-6 gap-6">
			{sections.map((section) => {
				const items = sectionItems[section.id] ?? []
				if (section.id === "genres") {
					return (
						<GenreSection
							key={section.id}
							items={items}
							providerId={providerId}
							pagePadding={pagePadding}
							gap={gap}
							cardWidth={cardWidth}
							sectionTitle={section.title || "Genres"}
							onScroll={handleHorizontalScroll(section.id)}
						/>
					)
				}
				return (
					<HorizontalSection
						key={section.id}
						sectionId={section.id}
						title={section.title}
						items={items}
						providerId={providerId}
						pagePadding={pagePadding}
						gap={gap}
						cardWidth={cardWidth}
						onScroll={handleHorizontalScroll(section.id)}
						renderItem={(item, index) => (
							<Link
								key={`${section.id}-${item.id}-${index}`}
								href={{
									pathname: "/manga/[id]",
									params: { id: item.id, provider: providerId },
								}}
								asChild
							>
								<Pressable>
									<MangaCard
										title={item.title}
										subtitle={item.subtitle}
										coverUrl={item.coverUrl}
										tags={item.tags}
										lastChapter={item.lastChapter}
										language={item.language}
										inLibrary={isInLibrary(item.id)}
									/>
								</Pressable>
							</Link>
						)}
					/>
				)
			})}
		</View>
	)
}
