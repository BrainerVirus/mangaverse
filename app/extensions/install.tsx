import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { GradientBackdrop } from '@components/GradientBackdrop';
import { useThemeColors } from '@lib/themes/vars';
import { installExtensionFromUrl, loadInstalledExtensions, saveInstalledExtensions } from '@services/extensions/manager';
import { useExtensionsStore } from '@stores/extensions';

const parseLanguages = (raw?: string | string[]) => {
	if (!raw) {
		return [] as string[];
	}
	const value = Array.isArray(raw) ? raw.join(',') : raw;
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
};

const parseBoolean = (raw?: string | string[]) => {
	if (!raw) {
		return undefined;
	}
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}
	return undefined;
};

export default function ExtensionInstall() {
	const params = useLocalSearchParams();
	const router = useRouter();
	const setInstalled = useExtensionsStore((state) => state.setInstalled);
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders);
	const [status, setStatus] = useState<'idle' | 'installing' | 'done' | 'error'>('idle');
	const [message, setMessage] = useState<string | null>(null);
	const themeColors = useThemeColors();
	const extensionParams = useMemo(() => {
		const bundleUrl = typeof params.bundle === 'string' ? params.bundle : '';
		return {
			bundleUrl,
			id: typeof params.id === 'string' ? params.id : undefined,
			name: typeof params.name === 'string' ? params.name : undefined,
			version: typeof params.version === 'string' ? params.version : undefined,
			icon: typeof params.icon === 'string' ? params.icon : undefined,
			languages: parseLanguages(params.languages),
			nsfw: parseBoolean(params.nsfw),
			minAppVersion: typeof params.minAppVersion === 'string' ? params.minAppVersion : undefined,
		};
	}, [params]);

	const handleInstall = async () => {
		if (!extensionParams.bundleUrl || status === 'installing') {
			return;
		}
		setStatus('installing');
		setMessage(null);
		try {
			const extension = await installExtensionFromUrl(extensionParams);
			const installed = await loadInstalledExtensions();
			const existing = installed.find((item) => item.id === extension.id);
			const next = existing
				? installed.map((item) => (item.id === extension.id ? { ...extension, order: item.order } : item))
				: [...installed, { ...extension, order: installed.length }];
			setInstalled(next);
			await saveInstalledExtensions(next);
			await refreshProviders();
			setStatus('done');
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Failed to install extension');
			setStatus('error');
		}
	};

	const title =
		status === 'installing'
			? 'Installing extension'
			: status === 'done'
				? 'Extension installed'
				: status === 'error'
					? 'Install failed'
					: 'Review extension';

	return (
		<View className="bg-background flex-1">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<View className="border-border/30 bg-card/70 rounded-box border p-5">
					<Text className="text-preset-2 font-heading text-foreground font-semibold">{title}</Text>
					<Text className="text-preset-1 font-body text-muted mt-2">{extensionParams.name || 'Unknown extension'}</Text>
					<Text className="text-preset-1 text-muted-foreground mt-1 tracking-[0.2em] uppercase">{extensionParams.id ?? ''}</Text>
					<Text className="text-preset-1 font-body text-muted mt-3">
						Install this extension from a shared link. Only continue if you trust the source.
					</Text>
					{status === 'installing' ? (
						<View className="mt-4 flex-row items-center gap-3">
							<ActivityIndicator color={themeColors.accent} />
							<Text className="text-preset-1 font-body text-foreground">Downloading bundle…</Text>
						</View>
					) : null}
					{status === 'done' ? (
						<Text className="text-preset-1 font-body text-success mt-4">Extension is ready. You can return to settings.</Text>
					) : null}
					{status === 'error' ? <Text className="text-preset-1 font-body text-warning mt-4">{message ?? 'Failed to install.'}</Text> : null}
					<View className="mt-4 flex-row gap-3">
						<Text
							className="border-border/40 text-preset-1 font-heading text-muted rounded-badge flex-1 border px-4 py-2 text-center font-semibold tracking-[0.2em] uppercase"
							onPress={() => router.replace('/settings/extensions')}
						>
							Cancel
						</Text>
						<Text
							className={`text-preset-1 font-heading rounded-badge flex-1 px-4 py-2 text-center font-semibold tracking-[0.2em] uppercase ${
								!extensionParams.bundleUrl || status === 'installing' ? 'bg-chip text-muted' : 'bg-primary text-primary-foreground'
							}`}
							onPress={!extensionParams.bundleUrl || status === 'installing' ? undefined : handleInstall}
						>
							Install
						</Text>
					</View>
				</View>
				<View className="border-border/30 bg-card/70 rounded-box mt-5 border p-5">
					<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Bundle URL</Text>
					<Text className="text-preset-1 font-body text-foreground mt-2">{extensionParams.bundleUrl || 'Missing bundle URL'}</Text>
				</View>
				<View className="border-border/30 bg-card/70 rounded-box mt-5 border p-5">
					<Text className="text-preset-1 text-muted-foreground tracking-[0.2em] uppercase">Metadata</Text>
					<Text className="text-preset-1 font-body text-foreground mt-2">Version: {extensionParams.version ?? '0.0.0'}</Text>
					<Text className="text-preset-1 font-body text-foreground mt-1">Languages: {extensionParams.languages.join(', ') || 'Unknown'}</Text>
					<Text className="text-preset-1 font-body text-foreground mt-1">
						NSFW: {extensionParams.nsfw === undefined ? 'Unknown' : String(extensionParams.nsfw)}
					</Text>
					{extensionParams.minAppVersion ? (
						<Text className="text-preset-1 font-body text-foreground mt-1">Min app: {extensionParams.minAppVersion}</Text>
					) : null}
				</View>
			</ScrollView>
		</View>
	);
}
