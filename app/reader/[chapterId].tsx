import { useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import type { ProviderPage } from "../../types/provider"

export default function ReaderScreen() {
	const { chapterId, provider } = useLocalSearchParams<{ chapterId: string; provider?: string }>()
	const [pages] = useState<ProviderPage[]>([])
	const loading = false
	const providerId = provider ?? ""
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Reader" subtitle={`Chapter ${chapterId ?? ""}`} />
				{loading ? (
					<View className="items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6">
						<ActivityIndicator color="#ff9900" />
						<Text className="mt-3 text-sm text-neutral-400">Loading pages…</Text>
					</View>
				) : pages.length === 0 ? (
					<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-6">
						<Text className="text-base font-semibold text-white">No pages yet</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							This chapter has no pages available.
						</Text>
					</View>
				) : (
					<View className="gap-4 pb-12">
						{pages.map((page) => (
							<Image
								key={page.url}
								source={{ uri: page.url, headers: page.headers }}
								className="w-full rounded-3xl bg-neutral-900"
								resizeMode="contain"
							/>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	)
}
