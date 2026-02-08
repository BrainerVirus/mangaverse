import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

const themes = ["System", "Light", "Dark", "AMOLED"] as const

export default function AppearanceSettings() {
	const theme = useSettingsStore((state) => state.theme)
	const setTheme = useSettingsStore((state) => state.setTheme)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Appearance" subtitle="Theme & layout" />
				<View className="gap-3 pb-12">
					{themes.map((item) => (
						<Text
							key={item}
							className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
								theme === item
									? "border-amber-500 bg-amber-500/15 text-amber-100"
									: "border-neutral-800 bg-neutral-900/70 text-neutral-300"
							}`}
							onPress={() => setTheme(item)}
						>
							{item}
						</Text>
					))}
				</View>
			</ScrollView>
		</View>
	)
}
