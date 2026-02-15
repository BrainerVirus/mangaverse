import { useEffect } from "react"
import { ScrollView, Switch, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useHistoryStore } from "@stores/history"
import { usePreferencesStore } from "@stores/preferences"
import { useTabBarPadding } from "../../hooks/useTabBarPadding"

export default function History() {
	const entries = useHistoryStore((state) => state.entries)
	const privateMode = usePreferencesStore((state) => state.privateMode)
	const setPrivateMode = usePreferencesStore((state) => state.setPrivateMode)
	const seedHistory = useHistoryStore((state) => state.seedHistory)
	const tabBarPadding = useTabBarPadding(24)

	useEffect(() => {
		seedHistory()
	}, [seedHistory])
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView
				className="flex-1 px-5 pt-6"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: tabBarPadding }}
			>
				<SectionHeading title="History" subtitle="Resume where you left off" />
				<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-base font-semibold text-white">Private mode</Text>
							<Text className="mt-2 text-sm text-neutral-400">
								When enabled, we will not store reading history.
							</Text>
						</View>
						<Switch
							value={privateMode}
							onValueChange={setPrivateMode}
							trackColor={{ false: "#2b2b30", true: "#ffb14a" }}
							thumbColor={privateMode ? "#0b0b0c" : "#e5e5ea"}
							ios_backgroundColor="#2b2b30"
						/>
					</View>
				</View>
				{privateMode ? (
					<View className="mt-4 rounded-[28px] border border-amber-500/40 bg-amber-500/10 p-5">
						<Text className="text-base font-semibold text-amber-100">Private mode is on</Text>
						<Text className="mt-2 text-sm text-amber-100/80">
							History entries will not be saved while private mode is enabled.
						</Text>
					</View>
				) : null}
				{entries.length === 0 ? (
					<View className="mt-6 rounded-[28px] border border-white/5 bg-neutral-900/80 p-6">
						<Text className="text-lg font-semibold text-white">Nothing here yet.</Text>
						<Text className="mt-2 text-sm text-neutral-400">
							Start reading to see your history appear.
						</Text>
					</View>
				) : (
					<View className="mt-6 gap-4 pb-12">
						<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
							<View className="flex-row items-center justify-between">
								<View>
									<Text className="text-xs tracking-[0.2em] text-neutral-500 uppercase">
										Recent sessions
									</Text>
									<Text className="mt-2 text-2xl font-semibold text-white">
										{entries.length} reads
									</Text>
								</View>
								<View className="rounded-full border border-white/10 bg-neutral-950/60 px-3 py-2">
									<Text className="text-xs tracking-[0.2em] text-neutral-400 uppercase">
										History
									</Text>
								</View>
							</View>
							<View className="mt-4 gap-3">
								{entries.map((entry) => (
									<View
										key={entry.id}
										className="rounded-[26px] border border-white/5 bg-neutral-900/70 p-5"
									>
										<Text className="text-base font-semibold text-white">{entry.title}</Text>
										<Text className="mt-1 text-xs tracking-[0.2em] text-neutral-500 uppercase">
											{entry.readAtLabel}
										</Text>
										<Text className="mt-3 text-sm text-neutral-400">
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
	)
}
