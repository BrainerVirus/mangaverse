import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"

export default function SecuritySettings() {
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Security" subtitle="App lock & biometrics" />
				<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">App lock</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Enable biometrics to protect the app.
					</Text>
				</View>
			</ScrollView>
		</View>
	)
}
