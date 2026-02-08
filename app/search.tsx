import { useEffect, useState } from "react"
import { Link } from "expo-router"
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native"

import { useDebouncedValue } from "@lib/hooks"
import { useExtensionsStore } from "@stores/extensions"
import { useSearchStore } from "@stores/search"

export default function GlobalSearch() {
	const [query, setQuery] = useState("")
	const debouncedQuery = useDebouncedValue(query, 300)
	const providers = useExtensionsStore((state) => state.enabledProviders)
	const { resultsByProvider, searchAll, statusByProvider } = useSearchStore()
	const loading = false

	useEffect(() => {
		const trimmed = debouncedQuery.trim()
		if (trimmed.length === 0) {
			return
		}
		searchAll(
			trimmed,
			providers.map((provider) => provider.id)
		)
	}, [debouncedQuery, providers, searchAll])

	return (
		<View className="flex-1 bg-neutral-950">
			<View className="border-b border-neutral-800 px-4 pb-3 pt-4">
				<Text className="mb-2 text-xs uppercase tracking-[0.24em] text-neutral-400">
					Global search
				</Text>
				<TextInput
					className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-white"
					placeholder="Search across providers"
					placeholderTextColor="#7b7b88"
					value={query}
					onChangeText={setQuery}
					autoFocus
				/>
			</View>
			<ScrollView className="flex-1 px-4">
				{loading ? (
					<View className="items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
						<ActivityIndicator color="#ff9900" />
						<Text className="mt-3 text-sm text-neutral-400">Loading providers…</Text>
					</View>
				) : providers.length === 0 ? (
					<View className="py-12">
						<Text className="text-base text-neutral-200">No extensions installed.</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Install an extension to enable global search.
						</Text>
					</View>
				) : (
					providers.map((provider) => {
						const status = statusByProvider[provider.id]
						const results = resultsByProvider[provider.id] ?? []
						return (
							<View key={provider.id} className="border-b border-neutral-900 py-5">
								<View className="mb-3 flex-row items-center justify-between">
									<Text className="text-lg font-semibold text-white">
										{provider.name}
									</Text>
										<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
											{status ?? "idle"}
										</Text>
									</View>
									{results.length === 0 ? (
										<Text className="text-sm text-neutral-500">
											No results yet.
										</Text>
									) : (
										results.map((item) => (
											<Link
												key={`${provider.id}-${item.id}`}
												href={{
													pathname: "/manga/[id]",
													params: { id: item.id, provider: provider.id },
												}}
												className="mb-3 rounded-2xl border border-white/5 bg-neutral-900/70 p-4"
											>
												<Text className="text-base font-semibold text-white">{item.title}</Text>
												<Text className="mt-1 text-sm text-neutral-400">
													{item.subtitle ?? "Tap to view details"}
												</Text>
											</Link>
										))
									)}
								</View>
						)
					})
				)}
			</ScrollView>
		</View>
	)
}
