import { Link, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useFavoritesStore } from "@services/library/favorites"
import type { ProviderChapter, ProviderMangaItem } from "../../types/provider"

export default function MangaDetail() {
	const { id, provider } = useLocalSearchParams<{ id: string; provider?: string }>()
	const [details] = useState<ProviderMangaItem | null>(null)
	const [chapters] = useState<ProviderChapter[]>([])
	const loading = false
	const favoriteStore = useFavoritesStore()
	const providerId = provider ?? ""
	const isFavorite = details ? favoriteStore.contains(details.id, providerId) : false
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Manga" subtitle={details?.title ?? "Loading"} />
				<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					{loading ? (
						<View className="items-center justify-center py-6">
							<ActivityIndicator color="#ff9900" />
							<Text className="mt-3 text-sm text-neutral-400">Loading details…</Text>
						</View>
					) : details ? (
						<View className="flex-row gap-4">
							{details.coverUrl ? (
								<Image
									source={{ uri: details.coverUrl }}
									className="h-36 w-24 rounded-2xl"
								/>
							) : (
								<View className="h-36 w-24 rounded-2xl bg-neutral-800" />
							)}
							<View className="flex-1">
								<Text className="text-base font-semibold text-white">{details.title}</Text>
								<Text className="mt-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
									{providerId}
								</Text>
								<Text className="mt-3 text-sm text-neutral-400" numberOfLines={4}>
									{details.description || "No description yet."}
								</Text>
							</View>
						</View>
					) : null}
					{details ? (
						<Text
							className={`mt-4 rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] ${
								isFavorite
									? "bg-amber-500 text-neutral-950"
									: "bg-neutral-800 text-neutral-300"
							}`}
							onPress={() => {
								if (isFavorite) {
									favoriteStore.remove(details.id, providerId)
								} else {
									favoriteStore.add(details, providerId)
								}
							}}
						>
							{isFavorite ? "In library" : "Add to library"}
						</Text>
					) : null}
				</View>
				<View className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Chapters</Text>
					{chapters.length === 0 ? (
						<Text className="mt-2 text-sm text-neutral-400">
							No chapters loaded yet.
						</Text>
					) : (
						<View className="mt-3 gap-3">
							{chapters.slice(0, 10).map((chapter) => (
								<Link
									key={chapter.id}
									href={{
										pathname: "/reader/[chapterId]",
										params: { chapterId: chapter.id, provider: providerId },
									}}
									className="rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-3"
								>
									<Text className="text-sm font-semibold text-white">{chapter.title}</Text>
								</Link>
							))}
						</View>
					)}
				</View>
			</ScrollView>
		</View>
	)
}
