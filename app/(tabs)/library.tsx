import { Link } from "expo-router"
import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { MangaCard } from "@components/MangaCard"
import { SectionHeading } from "@components/SectionHeading"
import { useFavoritesStore } from "@services/library/favorites"

export default function Library() {
	const favorites = useFavoritesStore((state) => state.items)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Library" subtitle="Your saved manga" />
				{favorites.length === 0 ? (
					<View className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
						<Text className="text-lg font-semibold text-white">Your library is empty.</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Find a series in Discover or Search to add it here.
						</Text>
						<Link
							href="/discover"
							className="mt-4 rounded-full bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-neutral-950"
						>
							Browse Discover
						</Link>
					</View>
				) : (
					<View className="flex-row flex-wrap gap-4 pb-10">
						{favorites.map((item) => (
							<Link
								key={`${item.providerId}-${item.id}`}
								href={{
									pathname: "/manga/[id]",
									params: { id: item.id, provider: item.providerId },
								}}
								className="w-[47%]"
							>
								<MangaCard
									title={item.title}
									subtitle={item.providerId}
									coverUrl={item.coverUrl}
								/>
							</Link>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	)
}
