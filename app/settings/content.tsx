import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

export default function ContentSettings() {
	const explicitContent = useSettingsStore((state) => state.explicitContent)
	const setExplicitContent = useSettingsStore((state) => state.setExplicitContent)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Content" subtitle="Filtering preferences" />
				<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Explicit content</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Explicit content is currently {explicitContent ? "enabled" : "disabled"}.
					</Text>
					<Text
						className={`mt-3 rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] ${
							explicitContent
								? "bg-amber-500 text-neutral-950"
								: "bg-neutral-800 text-neutral-300"
						}`}
						onPress={() => setExplicitContent(!explicitContent)}
					>
						{explicitContent ? "Enabled" : "Disabled"}
					</Text>
				</View>
			</ScrollView>
		</View>
	)
}
