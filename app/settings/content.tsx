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
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Content" subtitle="Filtering preferences" />
				<View className="border-border/30 bg-card/70 rounded-box border p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-preset-2 font-heading text-foreground font-semibold">Explicit content</Text>
							<Text className="text-preset-1 font-body text-muted mt-2">Show mature series in Discover and Search.</Text>
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
