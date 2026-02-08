import { ScrollView, Text, TextInput, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import { useExtensionsStore } from "@stores/extensions"

export default function ExtensionsSettings() {
	const repoUrl = useExtensionsStore((state) => state.repoUrl)
	const setRepoUrl = useExtensionsStore((state) => state.setRepoUrl)
	const providers = useExtensionsStore((state) => state.enabledProviders)

	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<SectionHeading title="Extensions" subtitle="Manage providers" />
				<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
					<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
						Repository URL
					</Text>
					<TextInput
						value={repoUrl}
						onChangeText={setRepoUrl}
						placeholder="https://example.com/extensions.json"
						placeholderTextColor="#7b7b88"
						className="mt-3 rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white"
						autoCapitalize="none"
						autoCorrect={false}
					/>
				</View>
				<View className="mt-6 gap-4 pb-12">
					{providers.length === 0 ? (
						<View className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
							<Text className="text-base font-semibold text-white">
								No extensions installed.
							</Text>
							<Text className="mt-2 text-sm text-neutral-400">
								Add a repository URL to browse extensions.
							</Text>
						</View>
					) : (
						providers.map((provider) => (
							<View
								key={provider.id}
								className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5"
							>
								<Text className="text-base font-semibold text-white">
									{provider.name}
								</Text>
								<Text className="mt-2 text-sm text-neutral-400">
									{provider.meta.supportedLanguages.join(", ") || "No languages"}
								</Text>
							</View>
						))
					)}
				</View>
			</ScrollView>
		</View>
	)
}
