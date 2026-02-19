import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { MangaCard } from '@components/MangaCard';
import { useDebouncedValue } from '@lib/hooks';
import { useThemeColors } from '@lib/themes/vars';
import { useExtensionsStore } from '@stores/extensions';
import { useSearchStore } from '@stores/search';

export default function GlobalSearch() {
	const [query, setQuery] = useState('');
	const debouncedQuery = useDebouncedValue(query, 300);
	const providers = useExtensionsStore((state) => state.enabledProviders);
	const { resultsByProvider, searchAll, statusByProvider } = useSearchStore();
	const loading = Object.values(statusByProvider).some((status) => status === 'loading');
	const trimmedQuery = debouncedQuery.trim();
	const hasQuery = trimmedQuery.length > 0;
	const themeColors = useThemeColors();

	useEffect(() => {
		if (!hasQuery) {
			searchAll('', []);
			return;
		}
		searchAll(
			trimmedQuery,
			providers.map((provider) => provider.id),
		);
	}, [hasQuery, providers, searchAll, trimmedQuery]);

	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<View className="px-5 pt-6">
				<Text className="text-preset-1 text-muted-foreground tracking-[0.24em] uppercase">Global search</Text>
				<Text className="text-preset-2 font-heading text-foreground mt-2 font-semibold">Find your next read</Text>
				<View className="border-border/30 bg-card/70 mt-4 rounded-[24px] border p-3">
					<TextInput
						className="border-border/40 bg-background text-preset-1 font-body text-foreground rounded-[18px] border px-4 py-3"
						placeholder="Search across providers"
						placeholderTextColor={themeColors.mutedForeground}
						value={query}
						onChangeText={setQuery}
						autoFocus
					/>
				</View>
			</View>
			<ScrollView className="flex-1 px-5 pt-4 pb-6" contentInsetAdjustmentBehavior="automatic">
				{loading ? (
					<View className="border-border/30 bg-card/80 items-center justify-center rounded-[28px] border p-6">
						<ActivityIndicator color={themeColors.accent} />
						<Text className="text-preset-1 font-body text-muted mt-3">Loading providers…</Text>
					</View>
				) : !hasQuery ? (
					<View className="border-border/30 bg-card/70 rounded-[28px] border p-6">
						<Text className="text-preset-2 font-heading text-foreground font-semibold">Start typing to search</Text>
						<Text className="text-preset-1 font-body text-muted mt-2">Your results will appear grouped by provider.</Text>
					</View>
				) : providers.length === 0 ? (
					<View className="border-border/30 bg-card/70 rounded-[28px] border p-6">
						<Text className="text-preset-2 font-heading text-foreground font-semibold">No extensions installed</Text>
						<Text className="text-preset-1 font-body text-muted mt-2">Install an extension to enable global search.</Text>
					</View>
				) : (
					providers.map((provider) => {
						const status = statusByProvider[provider.id];
						const results = resultsByProvider[provider.id] ?? [];
						const statusLabel = status === 'loading' ? 'Searching' : (status ?? 'idle');
						const hasResults = results.length > 0;
						const isEmpty = hasQuery && status === 'success' && !hasResults;
						return (
							<View key={provider.id} className="border-border/30 border-b py-6">
								<View className="mb-3 flex-row items-center justify-between">
									<Text className="text-preset-2 font-heading text-foreground font-semibold">{provider.name}</Text>
									<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">{statusLabel}</Text>
								</View>
								{isEmpty ? (
									<Text className="text-preset-1 font-body text-muted-foreground">No results for "{trimmedQuery}".</Text>
								) : hasResults ? (
									<View className="flex-row flex-wrap gap-4">
										{results.map((item) => (
											<Link
												key={`${provider.id}-${item.id}`}
												href={{
													pathname: '/manga/[id]',
													params: { id: item.id, provider: provider.id },
												}}
												asChild
											>
												<Pressable className="w-[47%]">
													<MangaCard title={item.title} subtitle={item.subtitle ?? provider.name} coverUrl={item.coverUrl} />
												</Pressable>
											</Link>
										))}
									</View>
								) : null}
							</View>
						);
					})
				)}
			</ScrollView>
		</View>
	);
}
