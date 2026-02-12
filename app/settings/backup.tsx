import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { exportBackup } from "@services/backup/local"

export default function BackupSettings() {
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Backup" subtitle="Export and sync" />
				<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Local backup</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Export and restore your library and progress.
					</Text>
					<Text
						className="mt-3 rounded-full bg-amber-500 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-950 uppercase"
						onPress={() => exportBackup({ version: 1, exportedAt: Date.now() })}
					>
						Export backup
					</Text>
				</View>
				<View className="mt-4 rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Cloud sync</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Requires an account. Sync scope: library, progress, settings.
					</Text>
				</View>
			</ScrollView>
		</View>
	)
}
