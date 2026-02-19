import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { SectionHeading } from '@components/SectionHeading';
import { useThemeColors } from '@lib/themes/vars';
import { installExtension, saveInstalledExtensions, uninstallExtension } from '@services/extensions/manager';
import { fetchExtensionIndex } from '@services/extensions/repository';
import { useExtensionsStore } from '@stores/extensions';
import { useSettingsStore } from '@stores/settings';
import type { ExtensionIndexItem } from '../../types/provider';

export default function ExtensionsSettings() {
	const repoUrl = useExtensionsStore((state) => state.repoUrl);
	const setRepoUrl = useExtensionsStore((state) => state.setRepoUrl);
	const providers = useExtensionsStore((state) => state.enabledProviders);
	const installed = useExtensionsStore((state) => state.installed);
	const setInstalled = useExtensionsStore((state) => state.setInstalled);
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders);
	const showProviderErrors = useSettingsStore((state) => state.showProviderErrors);
	const setShowProviderErrors = useSettingsStore((state) => state.setShowProviderErrors);
	const [index, setIndex] = useState<ExtensionIndexItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const themeColors = useThemeColors();

	useEffect(() => {
		refreshProviders().catch(() => {});
	}, [refreshProviders, setInstalled]);

	useEffect(() => {
		setLoading(true);
		setError(null);
		fetchExtensionIndex(repoUrl)
			.then((data) => setIndex(data))
			.catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
			.finally(() => setLoading(false));
	}, [repoUrl]);

	const handleInstall = async (item: ExtensionIndexItem) => {
		setLoading(true);
		setError(null);
		try {
			const extension = await installExtension(item);
			const next = [...installed, { ...extension, order: installed.length }];
			setInstalled(next);
			await saveInstalledExtensions(next);
			await refreshProviders();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to install');
		} finally {
			setLoading(false);
		}
	};

	const handleUninstall = async (id: string) => {
		setLoading(true);
		setError(null);
		try {
			await uninstallExtension(id);
			const next = installed.filter((entry) => entry.id !== id);
			setInstalled(next);
			await saveInstalledExtensions(next);
			await refreshProviders();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to uninstall');
		} finally {
			setLoading(false);
		}
	};

	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Extensions" subtitle="Manage providers" />
				<View className="border-border/30 bg-card/70 rounded-box border p-5">
					<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Repository URL</Text>
					<TextInput
						value={repoUrl}
						onChangeText={setRepoUrl}
						placeholder="https://example.com/extensions.json"
						placeholderTextColor={themeColors.mutedForeground}
						className="border-border/40 bg-background text-preset-1 font-body text-foreground rounded-control mt-3 border px-4 py-3"
						autoCapitalize="none"
						autoCorrect={false}
					/>
				</View>
				<View className="border-border/30 bg-card/70 rounded-box mt-4 border p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-preset-2 font-heading text-foreground font-semibold">Show provider errors</Text>
							<Text className="text-preset-1 font-body text-muted mt-2">Display extension load failures on Discover.</Text>
						</View>
						<Switch
							value={showProviderErrors}
							onValueChange={setShowProviderErrors}
							trackColor={{ false: themeColors.border, true: themeColors.accent }}
							thumbColor={showProviderErrors ? themeColors.background : themeColors.card}
							ios_backgroundColor={themeColors.border}
						/>
					</View>
				</View>
				{loading ? (
					<View className="border-border/30 bg-card/70 rounded-box mt-4 border p-5">
						<Text className="text-preset-1 font-body text-muted">Working…</Text>
					</View>
				) : null}
				{error ? (
					<View className="border-warning/40 bg-warning/10 rounded-box mt-4 border p-5">
						<Text className="text-preset-1 font-body text-warning">{error}</Text>
					</View>
				) : null}
				<View className="mt-6 gap-4 pb-12">
					{providers.length === 0 ? (
						<View className="border-border/30 bg-card/70 rounded-box border p-5">
							<Text className="text-preset-2 font-heading text-foreground font-semibold">No extensions installed.</Text>
							<Text className="text-preset-1 font-body text-muted mt-2">Add a repository URL to browse extensions.</Text>
						</View>
					) : (
						providers.map((provider) => (
							<View key={provider.id} className="border-border/30 bg-card/70 rounded-box border p-5">
								<Text className="text-preset-2 font-heading text-foreground font-semibold">{provider.name}</Text>
								<Text className="text-preset-1 font-body text-muted mt-2">{provider.meta.supportedLanguages.join(', ') || 'No languages'}</Text>
								<Text
									className="bg-chip text-preset-1 font-heading text-foreground rounded-badge mt-3 px-4 py-2 text-center font-semibold tracking-[0.2em] uppercase"
									onPress={loading ? undefined : () => handleUninstall(provider.id)}
								>
									Uninstall
								</Text>
							</View>
						))
					)}
					{index.length > 0 ? (
						<View className="gap-4">
							<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Available</Text>
							{index.map((item) => {
								const isInstalled = installed.some((entry) => entry.id === item.id);
								return (
									<View key={item.id} className="border-border/30 bg-card/70 rounded-box border p-5">
										<Text className="text-preset-2 font-heading text-foreground font-semibold">{item.name}</Text>
										<Text className="text-preset-1 font-body text-muted mt-1">{item.languages.join(', ') || 'No languages'}</Text>
										<Text
											className={`text-preset-1 font-heading rounded-badge mt-3 px-4 py-2 text-center font-semibold tracking-[0.2em] uppercase ${
												isInstalled ? 'bg-chip text-muted' : 'bg-primary text-primary-foreground'
											}`}
											onPress={isInstalled || loading ? undefined : () => handleInstall(item)}
										>
											{isInstalled ? 'Installed' : 'Install'}
										</Text>
									</View>
								);
							})}
						</View>
					) : null}
				</View>
			</ScrollView>
		</View>
	);
}
