import { ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { exportBackup } from '@services/backup/local';

export default function BackupSettings() {
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Backup" subtitle="Export and sync" />
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-3 font-heading font-semibold text-foreground">Local backup</Text>
					<Text className="text-preset-2 font-body text-muted mt-2">Export and restore your library and progress.</Text>
					<Text
						className="mt-3 rounded-full bg-accent px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-accent-foreground uppercase"
						onPress={() => exportBackup({ version: 1, exportedAt: Date.now() })}
					>
						Export backup
					</Text>
				</View>
				<View className="mt-4 rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-3 font-heading font-semibold text-foreground">Cloud sync</Text>
					<Text className="text-preset-2 font-body text-muted mt-2">Requires an account. Sync scope: library, progress, settings.</Text>
				</View>
			</ScrollView>
		</View>
	);
}
