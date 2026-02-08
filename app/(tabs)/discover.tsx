import { Link } from "expo-router"
import { ActivityIndicator, ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { MangaCard } from "@components/MangaCard"
import { SectionHeading } from "@components/SectionHeading"
import { useExtensionsStore } from "@stores/extensions"
import type { ProviderDiscoverSection, ProviderMangaItem } from "../../types/provider"

export default function Discover() {
	const providers = useExtensionsStore((state) => state.enabledProviders)
	const selectedProviderId = useExtensionsStore((state) => state.selectedProviderId)
	const setSelectedProvider = useExtensionsStore((state) => state.setSelectedProvider)
	const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
	const sections: ProviderDiscoverSection[] = selectedProvider?.sections ?? []
	const hasProviders = providers.length > 0
	const loading = false
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Discover" subtitle="Browse by provider" />
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					className="mb-6"
				>
					<View className="flex-row gap-3">
						{hasProviders ? (
							providers.map((provider) => (
								<View key={provider.id} className="overflow-hidden rounded-full">
								<Text
									className={`px-4 py-2 text-sm font-semibold ${
										provider.id === selectedProviderId
											? "bg-amber-500 text-neutral-950"
											: "bg-neutral-900/80 text-neutral-300"
									}`}
									onPress={() => setSelectedProvider(provider.id)}
								>
										{provider.name}
									</Text>
								</View>
							))
						) : (
							<View className="rounded-full border border-neutral-800 px-4 py-2">
								<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
									No providers
								</Text>
							</View>
						)}
					</View>
				</ScrollView>
				{loading ? (
					<View className="items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
						<ActivityIndicator color="#ff9900" />
						<Text className="mt-3 text-sm text-neutral-400">Loading providers…</Text>
					</View>
				) : !hasProviders ? (
					<View className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
						<Text className="text-lg font-semibold text-white">
							No extensions installed
						</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Install an extension to unlock discover sections and filters.
						</Text>
						<Link
							href="/settings/extensions"
							className="mt-4 rounded-full bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-neutral-950"
						>
							Go to Extensions
						</Link>
					</View>
				) : (
					<View className="gap-6 pb-12">
						{sections.map((section) => (
							<View key={section.id} className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
								<View className="flex-row items-center justify-between">
									<Text className="text-lg font-semibold text-white">
										{section.title}
									</Text>
									<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
										{section.items.length} titles
									</Text>
								</View>
								<View className="mt-4 flex-row flex-wrap gap-4">
									{section.items.map((item: ProviderMangaItem) => (
										<Link
											key={item.id}
											href={{
												pathname: "/manga/[id]",
												params: { id: item.id, provider: selectedProviderId },
											}}
											className="w-[47%]"
										>
											<MangaCard
												title={item.title}
												subtitle={item.subtitle}
												coverUrl={item.coverUrl}
											/>
										</Link>
									))}
								</View>
							</View>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	)
}
