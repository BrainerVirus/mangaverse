import { useEffect } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useThemeColors } from '@lib/themes/vars';
import { useHistoryStore } from '@stores/history';
import { usePreferencesStore } from '@stores/preferences';
import { useTabBarPadding } from '../../hooks/useTabBarPadding';

export default function History() {
	const entries = useHistoryStore((state) => state.entries);
	const privateMode = usePreferencesStore((state) => state.privateMode);
	const setPrivateMode = usePreferencesStore((state) => state.setPrivateMode);
	const seedHistory = useHistoryStore((state) => state.seedHistory);
	const tabBarPadding = useTabBarPadding(24);
	const themeColors = useThemeColors();

	useEffect(() => {
		seedHistory();
	}, [seedHistory]);
	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarPadding }}>
				<SectionHeading title="History" subtitle="Resume where you left off" />
				<View className="border-border/30 bg-card/70 rounded-[28px] border p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-preset-2 font-heading text-foreground font-semibold">Private mode</Text>
							<Text className="text-preset-1 font-body text-muted mt-2">When enabled, we will not store reading history.</Text>
						</View>
						<Switch
							value={privateMode}
							onValueChange={setPrivateMode}
							trackColor={{ false: themeColors.border, true: themeColors.accent }}
							thumbColor={privateMode ? themeColors.background : themeColors.card}
							ios_backgroundColor={themeColors.border}
						/>
					</View>
				</View>
				{privateMode ? (
					<View className="border-warning/40 bg-warning/10 mt-4 rounded-[28px] border p-5">
						<Text className="text-preset-2 font-heading text-warning font-semibold">Private mode is on</Text>
						<Text className="text-preset-1 font-body text-warning mt-2">History entries will not be saved while private mode is enabled.</Text>
					</View>
				) : null}
				{entries.length === 0 ? (
					<View className="border-border/30 bg-card/80 mt-6 rounded-[28px] border p-6">
						<Text className="text-preset-2 font-heading text-foreground font-semibold">Nothing here yet.</Text>
						<Text className="text-preset-1 font-body text-muted mt-2">Start reading to see your history appear.</Text>
					</View>
				) : (
					<View className="mt-6 gap-4 pb-12">
						<View className="border-border/30 bg-card/70 rounded-[28px] border p-5">
							<View className="flex-row items-center justify-between">
								<View>
									<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Recent sessions</Text>
									<Text className="text-preset-2 font-heading text-foreground mt-2 font-semibold">{entries.length} reads</Text>
								</View>
								<View className="border-border/40 bg-background/60 rounded-full border px-3 py-2">
									<Text className="text-preset-1 text-muted tracking-[0.2em] uppercase">History</Text>
								</View>
							</View>
							<View className="mt-4 gap-3">
								{entries.map((entry) => (
									<View key={entry.id} className="border-border/30 bg-card/70 rounded-[26px] border p-5">
										<Text className="text-preset-2 font-heading text-foreground font-semibold">{entry.title}</Text>
										<Text className="text-preset-1 text-muted-foreground mt-1 tracking-[0.2em] uppercase">{entry.readAtLabel}</Text>
										<Text className="text-preset-1 font-body text-muted mt-3">
											Chapter {entry.chapter} · Page {entry.page}
										</Text>
									</View>
								))}
							</View>
						</View>
					</View>
				)}
			</ScrollView>
		</View>
	);
}
