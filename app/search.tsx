import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';

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
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<View className="px-5 pt-6">
				<Text className="text-preset-1 tracking-[0.24em] text-muted-foreground uppercase">Global search</Text>
				<Text className="text-preset-2 font-heading font-semibold text-foreground mt-2">Find your next read</Text>
				<View className="mt-4 rounded-[24px] border border-border/30 bg-card/70 p-3">
					<TextInput
						className="rounded-[18px] border border-border/40 bg-background px-4 py-3 text-preset-1 font-body text-foreground"
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
					<View className="items-center justify-center rounded-[28px] border border-border/30 bg-card/80 p-6">
						<ActivityIndicator color={themeColors.accent} />
						<Text className="mt-3 text-preset-1 font-body text-muted">Loading providers…</Text>
					</View>
				) : !hasQuery ? (
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-6">
						<Text className="text-preset-2 font-heading font-semibold text-foreground">Start typing to search</Text>
						<Text className="mt-2 text-preset-1 font-body text-muted">Your results will appear grouped by provider.</Text>
					</View>
				) : providers.length === 0 ? (
					<View className="rounded-[28px] border border-border/30 bg-card/70 p-6">
						<Text className="text-preset-2 font-heading font-semibold text-foreground">No extensions installed</Text>
						<Text className="mt-2 text-preset-1 font-body text-muted">Install an extension to enable global search.</Text>
					</View>
				) : (
					providers.map((provider) => {
						const status = statusByProvider[provider.id];
						const results = resultsByProvider[provider.id] ?? [];
						const statusLabel = status === 'loading' ? 'Searching' : (status ?? 'idle');
						const hasResults = results.length > 0;
						const isEmpty = hasQuery && status === 'success' && !hasResults;
						return (
							<View key={provider.id} className="border-b border-border/30 py-6">
								<View className="mb-3 flex-row items-center justify-between">
									<Text className="text-preset-2 font-heading font-semibold text-foreground">{provider.name}</Text>
									<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">{statusLabel}</Text>
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
												className="w-[47%]"
											>
												<MangaCard title={item.title} subtitle={item.subtitle ?? provider.name} coverUrl={item.coverUrl} />
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
