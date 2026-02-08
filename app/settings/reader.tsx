import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

const modes = [
	{ id: "rtl", label: "Right to left" },
	{ id: "ltr", label: "Left to right" },
	{ id: "vertical", label: "Vertical paged" },
	{ id: "webtoon", label: "Webtoon" },
	{ id: "double", label: "Double page" },
]

export default function ReaderSettings() {
	const readerMode = useSettingsStore((state) => state.readerMode)
	const setReaderMode = useSettingsStore((state) => state.setReaderMode)
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Reader" subtitle="Defaults & gestures" />
				<View className="gap-3 pb-12">
					{modes.map((mode) => (
						<Text
							key={mode.id}
							className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
								readerMode === mode.id
									? "border-amber-500 bg-amber-500/15 text-amber-100"
									: "border-neutral-800 bg-neutral-900/70 text-neutral-300"
							}`}
							onPress={() => setReaderMode(mode.id)}
						>
							{mode.label}
						</Text>
					))}
				</View>
			</ScrollView>
		</View>
	)
}
