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
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6" contentInsetAdjustmentBehavior="automatic">
				<SectionHeading title="Extensions" subtitle="Manage providers" />
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Repository URL</Text>
					<TextInput
						value={repoUrl}
						onChangeText={setRepoUrl}
						placeholder="https://example.com/extensions.json"
						placeholderTextColor={themeColors.mutedForeground}
						className="mt-3 rounded-2xl border border-border/40 bg-background px-4 py-3 text-preset-1 font-body text-foreground"
						autoCapitalize="none"
						autoCorrect={false}
					/>
				</View>
				<View className="mt-4 rounded-[28px] border border-border/30 bg-card/70 p-5">
					<View className="flex-row items-center justify-between">
						<View className="flex-1 pr-4">
							<Text className="text-preset-2 font-heading font-semibold text-foreground">Show provider errors</Text>
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
					<View className="mt-4 rounded-[28px] border border-border/30 bg-card/70 p-5">
						<Text className="text-preset-1 font-body text-muted">Working…</Text>
					</View>
				) : null}
				{error ? (
					<View className="mt-4 rounded-[28px] border border-warning/40 bg-warning/10 p-5">
						<Text className="text-preset-1 font-body text-warning">{error}</Text>
					</View>
				) : null}
				<View className="mt-6 gap-4 pb-12">
					{providers.length === 0 ? (
						<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
							<Text className="text-preset-2 font-heading font-semibold text-foreground">No extensions installed.</Text>
							<Text className="text-preset-1 font-body text-muted mt-2">Add a repository URL to browse extensions.</Text>
						</View>
					) : (
						providers.map((provider) => (
							<View key={provider.id} className="rounded-[26px] border border-border/30 bg-card/70 p-5">
								<Text className="text-preset-2 font-heading font-semibold text-foreground">{provider.name}</Text>
								<Text className="text-preset-1 font-body text-muted mt-2">{provider.meta.supportedLanguages.join(', ') || 'No languages'}</Text>
								<Text
									className="mt-3 rounded-full bg-chip px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-foreground uppercase"
									onPress={loading ? undefined : () => handleUninstall(provider.id)}
								>
									Uninstall
								</Text>
							</View>
						))
					)}
					{index.length > 0 ? (
						<View className="gap-4">
							<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Available</Text>
							{index.map((item) => {
								const isInstalled = installed.some((entry) => entry.id === item.id);
								return (
									<View key={item.id} className="rounded-[26px] border border-border/30 bg-card/70 p-5">
										<Text className="text-preset-2 font-heading font-semibold text-foreground">{item.name}</Text>
										<Text className="text-preset-1 font-body text-muted mt-1">{item.languages.join(', ') || 'No languages'}</Text>
										<Text
											className={`mt-3 rounded-full px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] uppercase ${
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
