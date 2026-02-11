import { useEffect, useState } from "react"
import { Link } from "expo-router"
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { MangaCard } from "@components/MangaCard"
import { useDebouncedValue } from "@lib/hooks"
import { useExtensionsStore } from "@stores/extensions"
import { useSearchStore } from "@stores/search"

export default function GlobalSearch() {
	const [query, setQuery] = useState("")
	const debouncedQuery = useDebouncedValue(query, 300)
	const providers = useExtensionsStore((state) => state.enabledProviders)
	const { resultsByProvider, searchAll, statusByProvider } = useSearchStore()
	const loading = Object.values(statusByProvider).some((status) => status === "loading")
	const trimmedQuery = debouncedQuery.trim()
	const hasQuery = trimmedQuery.length > 0

	useEffect(() => {
		if (!hasQuery) {
			searchAll("", [])
			return
		}
		searchAll(
			trimmedQuery,
			providers.map((provider) => provider.id)
		)
	}, [hasQuery, providers, searchAll, trimmedQuery])

	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<View className="px-5 pt-6">
				<Text className="text-xs uppercase tracking-[0.24em] text-neutral-500">
					Global search
				</Text>
				<Text className="mt-2 text-3xl font-semibold text-[#f6f1e9]">
					Find your next read
				</Text>
				<View className="mt-4 rounded-[24px] border border-white/5 bg-neutral-900/70 p-3">
					<TextInput
						className="rounded-[18px] border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-white"
						placeholder="Search across providers"
						placeholderTextColor="#7b7b88"
						value={query}
						onChangeText={setQuery}
						autoFocus
					/>
				</View>
			</View>
			<ScrollView className="flex-1 px-5 pt-4 pb-6" contentInsetAdjustmentBehavior="automatic">
				{loading ? (
					<View className="items-center justify-center rounded-[28px] border border-white/5 bg-neutral-900/80 p-6">
						<ActivityIndicator color="#ff9900" />
						<Text className="mt-3 text-sm text-neutral-400">Loading providers…</Text>
					</View>
				) : !hasQuery ? (
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-6">
						<Text className="text-base font-semibold text-white">Start typing to search</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Your results will appear grouped by provider.
						</Text>
					</View>
				) : providers.length === 0 ? (
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-6">
						<Text className="text-lg font-semibold text-white">No extensions installed</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Install an extension to enable global search.
						</Text>
					</View>
				) : (
					providers.map((provider) => {
						const status = statusByProvider[provider.id]
						const results = resultsByProvider[provider.id] ?? []
						const statusLabel = status === "loading" ? "Searching" : status ?? "idle"
						const hasResults = results.length > 0
						const isEmpty = hasQuery && status === "success" && !hasResults
						return (
							<View key={provider.id} className="border-b border-neutral-900/60 py-6">
								<View className="mb-3 flex-row items-center justify-between">
									<Text className="text-lg font-semibold text-white">{provider.name}</Text>
									<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
										{statusLabel}
									</Text>
								</View>
								{isEmpty ? (
									<Text className="text-sm text-neutral-500">No results for "{trimmedQuery}".</Text>
								) : hasResults ? (
									<View className="flex-row flex-wrap gap-4">
										{results.map((item) => (
											<Link
												key={`${provider.id}-${item.id}`}
												href={{
													pathname: "/manga/[id]",
													params: { id: item.id, provider: provider.id },
												}}
												className="w-[47%]"
											>
												<MangaCard
													title={item.title}
													subtitle={item.subtitle ?? provider.name}
													coverUrl={item.coverUrl}
												/>
											</Link>
										))}
									</View>
								) : null}
							</View>
						)
					})
				)}
			</ScrollView>
		</View>
	)
}
