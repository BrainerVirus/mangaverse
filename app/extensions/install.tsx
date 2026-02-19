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
		<View className="flex-1 bg-background">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<View className="rounded-[28px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-2 font-heading font-semibold text-foreground">{title}</Text>
					<Text className="mt-2 text-preset-1 font-body text-muted">{extensionParams.name || 'Unknown extension'}</Text>
					<Text className="mt-1 text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">{extensionParams.id ?? ''}</Text>
					<Text className="mt-3 text-preset-1 font-body text-muted">
						Install this extension from a shared link. Only continue if you trust the source.
					</Text>
					{status === 'installing' ? (
						<View className="mt-4 flex-row items-center gap-3">
							<ActivityIndicator color={themeColors.accent} />
							<Text className="text-preset-1 font-body text-foreground">Downloading bundle…</Text>
						</View>
					) : null}
					{status === 'done' ? (
						<Text className="mt-4 text-preset-1 font-body text-success">Extension is ready. You can return to settings.</Text>
					) : null}
					{status === 'error' ? <Text className="mt-4 text-preset-1 font-body text-warning">{message ?? 'Failed to install.'}</Text> : null}
					<View className="mt-4 flex-row gap-3">
						<Text
							className="flex-1 rounded-full border border-border/40 px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] text-muted uppercase"
							onPress={() => router.replace('/settings/extensions')}
						>
							Cancel
						</Text>
						<Text
							className={`flex-1 rounded-full px-4 py-2 text-center text-preset-1 font-heading font-semibold tracking-[0.2em] uppercase ${
								!extensionParams.bundleUrl || status === 'installing' ? 'bg-chip text-muted' : 'bg-primary text-primary-foreground'
							}`}
							onPress={!extensionParams.bundleUrl || status === 'installing' ? undefined : handleInstall}
						>
							Install
						</Text>
					</View>
				</View>
				<View className="mt-5 rounded-[26px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Bundle URL</Text>
					<Text className="mt-2 text-preset-1 font-body text-foreground">{extensionParams.bundleUrl || 'Missing bundle URL'}</Text>
				</View>
				<View className="mt-5 rounded-[26px] border border-border/30 bg-card/70 p-5">
					<Text className="text-preset-1 tracking-[0.2em] text-muted-foreground uppercase">Metadata</Text>
					<Text className="mt-2 text-preset-1 font-body text-foreground">Version: {extensionParams.version ?? '0.0.0'}</Text>
					<Text className="mt-1 text-preset-1 font-body text-foreground">Languages: {extensionParams.languages.join(', ') || 'Unknown'}</Text>
					<Text className="mt-1 text-preset-1 font-body text-foreground">
						NSFW: {extensionParams.nsfw === undefined ? 'Unknown' : String(extensionParams.nsfw)}
					</Text>
					{extensionParams.minAppVersion ? (
						<Text className="mt-1 text-preset-1 font-body text-foreground">Min app: {extensionParams.minAppVersion}</Text>
					) : null}
				</View>
			</ScrollView>
		</View>
	);
}
