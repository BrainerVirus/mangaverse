import { Pressable, ScrollView, Text, useColorScheme, View } from 'react-native';

import { SectionHeading } from '@components/SectionHeading';
import { getThemePreview } from '@lib/themes/vars';
import { useSettingsStore } from '@stores/settings';

const themes = ['Modern', 'Cyberpunk', 'Noir', 'Sakura', 'Forest', 'Sunset', 'Ocean', 'Desert', 'Lavender', 'Slate'] as const;

export default function AppearanceSettings() {
	const theme = useSettingsStore((state) => state.theme);
	const setTheme = useSettingsStore((state) => state.setTheme);
	const colorScheme = useColorScheme();
	const previewMode = colorScheme === 'light' ? 'light' : 'dark';
	return (
		<View className="flex-1 bg-background">
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Appearance" subtitle="Theme & layout" />
				<View className="gap-3 pb-12">
					<View className="rounded-[22px] bg-card/70 p-5">
						<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Theme</Text>
						<View className="mt-4 gap-3">
							{themes.map((item) => {
								const isActive = theme === item;
								const preview = getThemePreview(item, previewMode);
								return (
									<Pressable
										key={item}
										className={`rounded-2xl border px-4 py-3 ${isActive ? 'border-success/80 bg-success/10' : 'border-border/30 bg-card'}`}
										onPress={() => setTheme(item)}
									>
										<View className="flex-row items-center justify-between">
											<Text className={`text-preset-2 font-heading font-semibold ${isActive ? 'text-foreground' : 'text-muted'}`}>{item}</Text>
											<View className="flex-row items-center gap-2">
												<View className="h-3 w-3 rounded-full" style={{ backgroundColor: preview.accent }} />
												<View className="h-3 w-3 rounded-full" style={{ backgroundColor: preview.background }} />
												<View className="h-3 w-3 rounded-full border" style={{ backgroundColor: preview.muted, borderColor: preview.border }} />
											</View>
										</View>
									</Pressable>
								);
							})}
						</View>
					</View>
				</View>
			</ScrollView>
		</View>
	);
}
