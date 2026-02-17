import { ScrollView, Switch, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useThemeColors } from '@lib/themes/vars';
import { useSettingsStore } from '@stores/settings';

export default function ContentSettings() {
	const explicitContent = useSettingsStore((state) => state.explicitContent);
	const setExplicitContent = useSettingsStore((state) => state.setExplicitContent);
	const themeColors = useThemeColors();
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Content" subtitle="Filtering preferences" />
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-preset-3 font-heading font-semibold text-foreground">Explicit content</Text>
							<Text className="mt-2 text-preset-2 font-body text-muted">Show mature series in Discover and Search.</Text>
						</View>
						<Switch
							value={explicitContent}
							onValueChange={setExplicitContent}
							trackColor={{ false: themeColors.border, true: themeColors.accent }}
							thumbColor={explicitContent ? themeColors.background : themeColors.card}
							ios_backgroundColor={themeColors.border}
						/>
					</View>
				</View>
			</ScrollView>
		</View>
	);
}
