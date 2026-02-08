import { ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"

export default function AuthHelp() {
	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Auth Setup" subtitle="Supabase configuration" />
				<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">Required settings</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						Add redirect URLs in Supabase Auth settings for magic links and OAuth.
					</Text>
					<Text className="mt-4 text-xs uppercase tracking-[0.2em] text-neutral-500">
						Production
					</Text>
					<Text className="mt-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-200">
						mangaverse://auth/callback
					</Text>
					<Text className="mt-4 text-xs uppercase tracking-[0.2em] text-neutral-500">
						Expo dev
					</Text>
					<Text className="mt-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-200">
						exp://&lt;your-dev-host&gt;/--/auth/callback
					</Text>
					<Text className="mt-4 text-sm text-neutral-400">
						Enable Google, Apple, Facebook, Discord, and GitHub providers in Supabase
						Auth settings, and set the redirect URL to the callback above.
					</Text>
				</View>
			</ScrollView>
		</View>
	)
}
