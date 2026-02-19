import { Link } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { useThemeColors } from '@lib/themes/vars';

interface DiscoverStatesProps {
	loading: boolean;
	error: string | null;
	hasProviders: boolean;
}

export function DiscoverStates({ loading, error, hasProviders }: DiscoverStatesProps) {
	const themeColors = useThemeColors();
	if (loading) {
		return (
			<View className="bg-card mt-6 items-center justify-center rounded-[22px] p-6">
				<ActivityIndicator color={themeColors.accent} />
				<Text className="text-muted text-preset-1 font-body mt-3">Loading providers…</Text>
			</View>
		);
	}
	if (error) {
		return (
			<View className="bg-card mt-6 rounded-[22px] p-6">
				<Text className="text-foreground text-preset-2 font-heading font-semibold">Something went wrong</Text>
				<Text className="text-muted text-preset-1 font-body mt-2">{error}</Text>
			</View>
		);
	}
	if (!hasProviders) {
		return (
			<View className="bg-card mt-6 rounded-[22px] p-6">
				<Text className="text-foreground text-preset-2 font-heading font-semibold">No extensions installed</Text>
				<Text className="text-muted text-preset-1 font-body mt-2">Install an extension to unlock discover sections and filters.</Text>
				<Link
					href="/settings/extensions"
					className="bg-primary text-primary-foreground text-preset-1 font-heading mt-4 rounded-full px-4 py-2 text-center font-semibold"
				>
					Go to Extensions
				</Link>
			</View>
		);
	}
	return null;
}
