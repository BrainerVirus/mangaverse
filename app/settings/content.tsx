import { ScrollView, Switch, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

export default function ContentSettings() {
	const explicitContent = useSettingsStore((state) => state.explicitContent)
	const setExplicitContent = useSettingsStore((state) => state.setExplicitContent)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Content" subtitle="Filtering preferences" />
				<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-base font-semibold text-white">Explicit content</Text>
							<Text className="mt-2 text-sm text-neutral-400">
								Show mature series in Discover and Search.
							</Text>
						</View>
						<Switch
							value={explicitContent}
							onValueChange={setExplicitContent}
							trackColor={{ false: "#2b2b30", true: "#ffb14a" }}
							thumbColor={explicitContent ? "#0b0b0c" : "#e5e5ea"}
							ios_backgroundColor="#2b2b30"
						/>
					</View>
				</View>
			</ScrollView>
		</View>
	)
}
