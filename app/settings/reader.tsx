import { ScrollView, Switch, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

const modes = [
	{ id: "rtl", label: "Right to left" },
	{ id: "ltr", label: "Left to right" },
	{ id: "vertical", label: "Vertical paged" },
	{ id: "webtoon", label: "Webtoon" },
	{ id: "double", label: "Double page" },
] as const

const tapPresets = [
	{ id: "balanced", label: "Balanced" },
	{ id: "wide-center", label: "Wide center" },
	{ id: "classic", label: "Classic" },
] as const

const fitModes = [
	{ id: "contain", label: "Fit screen" },
	{ id: "width", label: "Fit width" },
	{ id: "cover", label: "Fill screen" },
] as const

const backgrounds = [
	{ id: "ink", label: "Ink" },
	{ id: "graphite", label: "Graphite" },
	{ id: "parchment", label: "Parchment" },
] as const

export default function ReaderSettings() {
	const readerMode = useSettingsStore((state) => state.readerMode)
	const setReaderMode = useSettingsStore((state) => state.setReaderMode)
	const tapZonePreset = useSettingsStore((state) => state.tapZonePreset)
	const setTapZonePreset = useSettingsStore((state) => state.setTapZonePreset)
	const swipeEnabled = useSettingsStore((state) => state.swipeEnabled)
	const setSwipeEnabled = useSettingsStore((state) => state.setSwipeEnabled)
	const tapNavigationEnabled = useSettingsStore((state) => state.tapNavigationEnabled)
	const setTapNavigationEnabled = useSettingsStore((state) => state.setTapNavigationEnabled)
	const autoHideChrome = useSettingsStore((state) => state.autoHideChrome)
	const setAutoHideChrome = useSettingsStore((state) => state.setAutoHideChrome)
	const fitMode = useSettingsStore((state) => state.fitMode)
	const setFitMode = useSettingsStore((state) => state.setFitMode)
	const background = useSettingsStore((state) => state.background)
	const setBackground = useSettingsStore((state) => state.setBackground)
	const lockRotation = useSettingsStore((state) => state.lockRotation)
	const setLockRotation = useSettingsStore((state) => state.setLockRotation)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Reader" subtitle="Defaults & gestures" />
				<View className="gap-3 pb-12">
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
						<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
							Reading direction
						</Text>
						<View className="mt-4 gap-3">
							{modes.map((mode) => (
								<Text
									key={mode.id}
									className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
										readerMode === mode.id
											? "border-amber-400/80 bg-amber-500/15 text-amber-100"
											: "border-white/5 bg-neutral-900/70 text-neutral-300"
									}`}
									onPress={() => setReaderMode(mode.id)}
								>
									{mode.label}
								</Text>
							))}
						</View>
						<View className="mt-6">
							<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
								Tap zones
							</Text>
							<View className="mt-4 gap-3">
								{tapPresets.map((preset) => (
									<Text
										key={preset.id}
										className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
											tapZonePreset === preset.id
												? "border-amber-400/80 bg-amber-500/15 text-amber-100"
												: "border-white/5 bg-neutral-900/70 text-neutral-300"
										}`}
										onPress={() => setTapZonePreset(preset.id)}
									>
										{preset.label}
									</Text>
								))}
							</View>
						</View>
					</View>
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
						<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
							Display
						</Text>
						<View className="mt-4 gap-3">
							{fitModes.map((mode) => (
								<Text
									key={mode.id}
									className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
										fitMode === mode.id
												? "border-amber-400/80 bg-amber-500/15 text-amber-100"
												: "border-white/5 bg-neutral-900/70 text-neutral-300"
									}`}
									onPress={() => setFitMode(mode.id)}
								>
									{mode.label}
								</Text>
							))}
						</View>
						<View className="mt-6">
							<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
								Background
							</Text>
							<View className="mt-4 gap-3">
								{backgrounds.map((tone) => (
									<Text
										key={tone.id}
										className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
											background === tone.id
												? "border-amber-400/80 bg-amber-500/15 text-amber-100"
												: "border-white/5 bg-neutral-900/70 text-neutral-300"
										}`}
										onPress={() => setBackground(tone.id)}
									>
										{tone.label}
									</Text>
								))}
							</View>
						</View>
					</View>
					<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
						<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
							Controls
						</Text>
						<View className="mt-4 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-base font-semibold text-white">Swipe navigation</Text>
								<Text className="mt-2 text-sm text-neutral-400">
									Enable swipe gestures for page navigation.
								</Text>
							</View>
							<Switch
								value={swipeEnabled}
								onValueChange={setSwipeEnabled}
								trackColor={{ false: "#2b2b30", true: "#ffb14a" }}
								thumbColor={swipeEnabled ? "#0b0b0c" : "#e5e5ea"}
								ios_backgroundColor="#2b2b30"
							/>
						</View>
						<View className="mt-6 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-base font-semibold text-white">Tap navigation</Text>
								<Text className="mt-2 text-sm text-neutral-400">
									Enable tap zones to change pages.
								</Text>
							</View>
							<Switch
								value={tapNavigationEnabled}
								onValueChange={setTapNavigationEnabled}
								trackColor={{ false: "#2b2b30", true: "#ffb14a" }}
								thumbColor={tapNavigationEnabled ? "#0b0b0c" : "#e5e5ea"}
								ios_backgroundColor="#2b2b30"
							/>
						</View>
						<View className="mt-6 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-base font-semibold text-white">Auto-hide UI</Text>
								<Text className="mt-2 text-sm text-neutral-400">
									Hide controls after a short delay while reading.
								</Text>
							</View>
							<Switch
								value={autoHideChrome}
								onValueChange={setAutoHideChrome}
								trackColor={{ false: "#2b2b30", true: "#ffb14a" }}
								thumbColor={autoHideChrome ? "#0b0b0c" : "#e5e5ea"}
								ios_backgroundColor="#2b2b30"
							/>
						</View>
						<View className="mt-6 flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-base font-semibold text-white">Lock rotation</Text>
								<Text className="mt-2 text-sm text-neutral-400">
									Keep the reader in portrait mode.
								</Text>
							</View>
							<Switch
								value={lockRotation}
								onValueChange={setLockRotation}
								trackColor={{ false: "#2b2b30", true: "#ffb14a" }}
								thumbColor={lockRotation ? "#0b0b0c" : "#e5e5ea"}
								ios_backgroundColor="#2b2b30"
							/>
						</View>
					</View>
				</View>
			</ScrollView>
		</View>
	)
}
