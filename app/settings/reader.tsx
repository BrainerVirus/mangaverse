import { ScrollView, Switch, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useThemeColors } from '@lib/themes/vars';
import { useSettingsStore } from '@stores/settings';

const modes = [
	{ id: 'rtl', label: 'Right to left' },
	{ id: 'ltr', label: 'Left to right' },
	{ id: 'vertical', label: 'Vertical paged' },
	{ id: 'webtoon', label: 'Webtoon' },
	{ id: 'double', label: 'Double page' },
] as const;

const tapPresets = [
	{ id: 'balanced', label: 'Balanced' },
	{ id: 'wide-center', label: 'Wide center' },
	{ id: 'classic', label: 'Classic' },
] as const;

const fitModes = [
	{ id: 'contain', label: 'Fit screen' },
	{ id: 'width', label: 'Fit width' },
	{ id: 'cover', label: 'Fill screen' },
] as const;

const backgrounds = [
	{ id: 'ink', label: 'Ink' },
	{ id: 'graphite', label: 'Graphite' },
	{ id: 'parchment', label: 'Parchment' },
] as const;

export default function ReaderSettings() {
	const readerMode = useSettingsStore((state) => state.readerMode);
	const setReaderMode = useSettingsStore((state) => state.setReaderMode);
	const tapZonePreset = useSettingsStore((state) => state.tapZonePreset);
	const setTapZonePreset = useSettingsStore((state) => state.setTapZonePreset);
	const swipeEnabled = useSettingsStore((state) => state.swipeEnabled);
	const setSwipeEnabled = useSettingsStore((state) => state.setSwipeEnabled);
	const tapNavigationEnabled = useSettingsStore((state) => state.tapNavigationEnabled);
	const setTapNavigationEnabled = useSettingsStore((state) => state.setTapNavigationEnabled);
	const autoHideChrome = useSettingsStore((state) => state.autoHideChrome);
	const setAutoHideChrome = useSettingsStore((state) => state.setAutoHideChrome);
	const fitMode = useSettingsStore((state) => state.fitMode);
	const setFitMode = useSettingsStore((state) => state.setFitMode);
	const background = useSettingsStore((state) => state.background);
	const setBackground = useSettingsStore((state) => state.setBackground);
	const lockRotation = useSettingsStore((state) => state.lockRotation);
	const setLockRotation = useSettingsStore((state) => state.setLockRotation);
	const themeColors = useThemeColors();
	return (
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Reader" subtitle="Defaults & gestures" />
				<View className="gap-3 pb-12">
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
						<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Reading direction</Text>
						<View className="mt-4 gap-3">
							{modes.map((mode) => (
								<Text
									key={mode.id}
									className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
										readerMode === mode.id ? 'border-primary/80 bg-primary/15 text-primary' : 'border-border/30 bg-card/70 text-muted'
									}`}
									onPress={() => setReaderMode(mode.id)}
								>
									{mode.label}
								</Text>
							))}
						</View>
						<View className="mt-6">
							<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Tap zones</Text>
							<View className="mt-4 gap-3">
								{tapPresets.map((preset) => (
									<Text
										key={preset.id}
										className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
											tapZonePreset === preset.id ? 'border-primary/80 bg-primary/15 text-primary' : 'border-border/30 bg-card/70 text-muted'
										}`}
										onPress={() => setTapZonePreset(preset.id)}
									>
										{preset.label}
									</Text>
								))}
							</View>
						</View>
					</View>
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
						<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Display</Text>
						<View className="mt-4 gap-3">
							{fitModes.map((mode) => (
								<Text
									key={mode.id}
									className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
										fitMode === mode.id ? 'border-primary/80 bg-primary/15 text-primary' : 'border-border/30 bg-card/70 text-muted'
									}`}
									onPress={() => setFitMode(mode.id)}
								>
									{mode.label}
								</Text>
							))}
						</View>
						<View className="mt-6">
							<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Background</Text>
							<View className="mt-4 gap-3">
								{backgrounds.map((tone) => (
									<Text
										key={tone.id}
										className={`rounded-2xl border px-4 py-3 text-preset-2 font-heading font-semibold ${
											background === tone.id ? 'border-primary/80 bg-primary/15 text-primary' : 'border-border/30 bg-card/70 text-muted'
										}`}
										onPress={() => setBackground(tone.id)}
									>
										{tone.label}
									</Text>
								))}
							</View>
						</View>
					</View>
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
						<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Controls</Text>
						<View className="mt-4 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-preset-2 font-heading font-semibold text-foreground">Swipe navigation</Text>
								<Text className="text-preset-1 font-body text-muted mt-2">Enable swipe gestures for page navigation.</Text>
							</View>
							<Switch
								value={swipeEnabled}
								onValueChange={setSwipeEnabled}
								trackColor={{ false: themeColors.border, true: themeColors.accent }}
								thumbColor={swipeEnabled ? themeColors.background : themeColors.card}
								ios_backgroundColor={themeColors.border}
							/>
						</View>
						<View className="mt-6 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-preset-2 font-heading font-semibold text-foreground">Tap navigation</Text>
								<Text className="text-preset-1 font-body text-muted mt-2">Enable tap zones to change pages.</Text>
							</View>
							<Switch
								value={tapNavigationEnabled}
								onValueChange={setTapNavigationEnabled}
								trackColor={{ false: themeColors.border, true: themeColors.accent }}
								thumbColor={tapNavigationEnabled ? themeColors.background : themeColors.card}
								ios_backgroundColor={themeColors.border}
							/>
						</View>
						<View className="mt-6 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-preset-2 font-heading font-semibold text-foreground">Auto-hide UI</Text>
								<Text className="text-preset-1 font-body text-muted mt-2">Hide controls after a short delay while reading.</Text>
							</View>
							<Switch
								value={autoHideChrome}
								onValueChange={setAutoHideChrome}
								trackColor={{ false: themeColors.border, true: themeColors.accent }}
								thumbColor={autoHideChrome ? themeColors.background : themeColors.card}
								ios_backgroundColor={themeColors.border}
							/>
						</View>
						<View className="mt-6 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-preset-2 font-heading font-semibold text-foreground">Lock rotation</Text>
								<Text className="text-preset-1 font-body text-muted mt-2">Keep the reader in portrait mode.</Text>
							</View>
							<Switch
								value={lockRotation}
								onValueChange={setLockRotation}
								trackColor={{ false: themeColors.border, true: themeColors.accent }}
								thumbColor={lockRotation ? themeColors.background : themeColors.card}
								ios_backgroundColor={themeColors.border}
							/>
						</View>
					</View>
				</View>
			</ScrollView>
		</View>
	);
}
