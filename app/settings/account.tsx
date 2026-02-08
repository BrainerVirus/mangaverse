import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"

export default function AccountSettings() {
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Account" subtitle="Optional login" />
				<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Better Auth</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Sign in to enable sync and backups across devices.
					</Text>
				</View>
			</ScrollView>
		</View>
	)
}
