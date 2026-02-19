import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { exportBackup } from '@services/backup/local';

export default function BackupSettings() {
	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Backup" subtitle="Export and sync" />
				<View className="border-border/30 bg-card/70 rounded-[28px] border p-5">
					<Text className="text-preset-2 font-heading text-foreground font-semibold">Local backup</Text>
					<Text className="text-preset-1 font-body text-muted mt-2">Export and restore your library and progress.</Text>
					<Text
						className="bg-primary text-preset-1 font-heading text-primary-foreground mt-3 rounded-full px-4 py-2 text-center font-semibold tracking-[0.2em] uppercase"
						onPress={() => exportBackup({ version: 1, exportedAt: Date.now() })}
					>
						Export backup
					</Text>
				</View>
				<View className="border-border/30 bg-card/70 mt-4 rounded-[28px] border p-5">
					<Text className="text-preset-2 font-heading text-foreground font-semibold">Cloud sync</Text>
					<Text className="text-preset-1 font-body text-muted mt-2">Requires an account. Sync scope: library, progress, settings.</Text>
				</View>
			</ScrollView>
		</View>
	);
}
