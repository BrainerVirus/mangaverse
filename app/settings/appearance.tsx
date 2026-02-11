import { ScrollView, Text, View } from "react-native"

import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

const themes = ["System", "Modern", "Cyberpunk", "Noir", "Sakura", "Forest"] as const

export default function AppearanceSettings() {
	const theme = useSettingsStore((state) => state.theme)
	const setTheme = useSettingsStore((state) => state.setTheme)
	return (
		<View className="flex-1 bg-black">
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Appearance" subtitle="Theme & layout" />
				<View className="gap-3 pb-12">
					<View className="rounded-[22px] bg-neutral-900/70 p-5">
						<Text className="text-xs uppercase tracking-[0.2em] text-neutral-400">
							Theme
						</Text>
						<View className="mt-4 gap-3">
							{themes.map((item) => (
								<Text
									key={item}
									className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
										theme === item
											? "border-emerald-400/80 bg-emerald-500/10 text-white"
											: "border-white/5 bg-neutral-900 text-neutral-300"
									}`}
									onPress={() => setTheme(item)}
								>
									{item}
								</Text>
							))}
						</View>
					</View>
				</View>
			</ScrollView>
		</View>
	)
}
