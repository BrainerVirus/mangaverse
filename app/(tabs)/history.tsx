import { useEffect } from "react"
import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useHistoryStore } from "@stores/history"
import { usePreferencesStore } from "@stores/preferences"

export default function History() {
	const entries = useHistoryStore((state) => state.entries)
	const privateMode = usePreferencesStore((state) => state.privateMode)
	const setPrivateMode = usePreferencesStore((state) => state.setPrivateMode)
	const seedHistory = useHistoryStore((state) => state.seedHistory)

	useEffect(() => {
		seedHistory()
	}, [seedHistory])
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="History" subtitle="Resume where you left off" />
				<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Private mode</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						When enabled, we will not store reading history.
					</Text>
					<Text
						className={`mt-3 rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] ${
							privateMode
								? "bg-amber-500 text-neutral-950"
								: "bg-neutral-800 text-neutral-300"
						}`}
						onPress={() => setPrivateMode(!privateMode)}
					>
						{privateMode ? "Enabled" : "Disabled"}
					</Text>
				</View>
				{privateMode ? (
					<View className="mt-4 rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5">
						<Text className="text-base font-semibold text-amber-100">
							Private mode is on
						</Text>
						<Text className="mt-2 text-sm text-amber-100/80">
							History entries will not be saved while private mode is enabled.
						</Text>
					</View>
				) : null}
				{entries.length === 0 ? (
					<View className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
						<Text className="text-lg font-semibold text-white">Nothing here yet.</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Start reading to see your history appear.
						</Text>
					</View>
				) : (
					<View className="mt-6 gap-4 pb-12">
						{entries.map((entry) => (
							<View
								key={entry.id}
								className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5"
							>
								<Text className="text-base font-semibold text-white">
									{entry.title}
								</Text>
								<Text className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
									{entry.readAtLabel}
								</Text>
								<Text className="mt-3 text-sm text-neutral-400">
									Chapter {entry.chapter} · Page {entry.page}
								</Text>
							</View>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	)
}
