import { Link } from "expo-router"
import { ActivityIndicator, Text, View } from "react-native"

interface DiscoverStatesProps {
	loading: boolean
	error: string | null
	hasProviders: boolean
}

export function DiscoverStates({ loading, error, hasProviders }: DiscoverStatesProps) {
	if (loading) {
		return (
			<View className="bg-card mt-6 items-center justify-center rounded-[22px] p-6">
				<ActivityIndicator color="#ff6b6b" />
				<Text className="text-muted mt-3 text-sm">Loading providers…</Text>
			</View>
		)
	}
	if (error) {
		return (
			<View className="bg-card mt-6 rounded-[22px] p-6">
				<Text className="text-foreground text-base font-semibold">Something went wrong</Text>
				<Text className="text-muted mt-2 text-sm">{error}</Text>
			</View>
		)
	}
	if (!hasProviders) {
		return (
			<View className="bg-card mt-6 rounded-[22px] p-6">
				<Text className="text-foreground text-lg font-semibold">No extensions installed</Text>
				<Text className="text-muted mt-2 text-sm">
					Install an extension to unlock discover sections and filters.
				</Text>
				<Link
					href="/settings/extensions"
					className="bg-accent text-accent-foreground mt-4 rounded-full px-4 py-2 text-center text-sm font-semibold"
				>
					Go to Extensions
				</Link>
			</View>
		)
	}
	return null
}
