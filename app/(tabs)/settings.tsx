import { Link } from "expo-router"
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs"
import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useSettingsStore } from "@stores/settings"

const sections = [
	{
		id: "appearance",
		title: "Appearance",
		description: "Theme, library layout, AMOLED",
		link: "/settings/appearance",
	},
	{
		id: "reader",
		title: "Reader",
		description: "Defaults, tap zones, prefetch",
		link: "/settings/reader",
	},
	{
		id: "content",
		title: "Content filters",
		description: "Safe, suggestive, explicit",
		link: "/settings/content",
	},
	{
		id: "extensions",
		title: "Extensions",
		description: "Repo URL, install, languages",
		link: "/settings/extensions",
	},
	{
		id: "security",
		title: "Security",
		description: "App lock & biometrics",
		link: "/settings/security",
	},
	{
		id: "backup",
		title: "Backup & restore",
		description: "Export local JSON and sync",
		link: "/settings/backup",
	},
	{
		id: "account",
		title: "Account",
		description: "Optional Better Auth login",
		link: "/settings/account",
	},
]

export default function Settings() {
	const theme = useSettingsStore((state) => state.theme)
	const tabBarHeight = useBottomTabBarHeight()
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView
				className="flex-1 px-5 pt-6"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
			>
				<SectionHeading title="Settings" subtitle="Tune your experience" />
				<View className="mb-6 rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-sm tracking-[0.2em] text-neutral-500 uppercase">Theme</Text>
					<Text className="mt-2 text-lg font-semibold text-white">{theme}</Text>
					<Text className="mt-1 text-sm text-neutral-400">
						Appearance applies across the reader and library.
					</Text>
				</View>
				<View className="gap-4 pb-12">
					{sections.map((section) => (
						<Link
							key={section.id}
							href={section.link}
							className="rounded-[26px] border border-white/5 bg-neutral-900/70 p-5"
						>
							<Text className="text-lg font-semibold text-white">{section.title}</Text>
							<Text className="mt-2 text-sm text-neutral-400">{section.description}</Text>
						</Link>
					))}
				</View>
			</ScrollView>
		</View>
	)
}
