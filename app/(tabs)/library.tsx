import { Link } from "expo-router"
import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { MangaCard } from "@components/MangaCard"
import { SectionHeading } from "@components/SectionHeading"
import { useFavoritesStore } from "@services/library/favorites"
import { useTabBarPadding } from "../../hooks/useTabBarPadding"

export default function Library() {
	const favorites = useFavoritesStore((state) => state.items)
	const tabBarPadding = useTabBarPadding(24)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView
				className="flex-1 px-5 pt-6"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: tabBarPadding }}
			>
				<SectionHeading title="Library" subtitle="Your saved manga" />
				{favorites.length === 0 ? (
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/80 p-6">
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
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
						<View className="flex-row items-center justify-between">
							<View>
								<Text className="text-xs tracking-[0.2em] text-neutral-500 uppercase">
									Saved titles
								</Text>
								<Text className="mt-2 text-2xl font-semibold text-white">
									{favorites.length} series
								</Text>
							</View>
							<View className="rounded-full border border-white/10 bg-neutral-950/60 px-3 py-2">
								<Text className="text-xs tracking-[0.2em] text-neutral-400 uppercase">Library</Text>
							</View>
						</View>
						<View className="mt-4 flex-row flex-wrap gap-4">
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
					</View>
				)}
			</ScrollView>
		</View>
	)
}
