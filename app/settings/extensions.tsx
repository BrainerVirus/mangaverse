import { useEffect, useState } from "react"
import { ScrollView, Text, TextInput, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import { SectionHeading } from "@components/SectionHeading"
import {
	installExtension,
	loadInstalledExtensions,
	loadProviderFromExtension,
	saveInstalledExtensions,
	uninstallExtension,
} from "@services/extensions/manager"
import { fetchExtensionIndex } from "@services/extensions/repository"
import { useExtensionsStore } from "@stores/extensions"
import type { ExtensionIndexItem } from "../../types/provider"

export default function ExtensionsSettings() {
	const repoUrl = useExtensionsStore((state) => state.repoUrl)
	const setRepoUrl = useExtensionsStore((state) => state.setRepoUrl)
	const providers = useExtensionsStore((state) => state.enabledProviders)
	const installed = useExtensionsStore((state) => state.installed)
	const setInstalled = useExtensionsStore((state) => state.setInstalled)
	const setProvider = useExtensionsStore((state) => state.setProvider)
	const setProviders = useExtensionsStore((state) => state.setProviders)
	const [index, setIndex] = useState<ExtensionIndexItem[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		loadInstalledExtensions()
			.then((items) => setInstalled(items))
			.catch(() => {})
	}, [setInstalled])

	useEffect(() => {
		const loadProviders = async () => {
			if (installed.length === 0) {
				setProviders([])
				return
			}
			const enabledProviders = await Promise.all(
				installed
					.filter((entry) => entry.enabled)
					.sort((a, b) => a.order - b.order)
					.map(async (entry) => {
						const provider = await loadProviderFromExtension(entry)
						setProvider(entry.id, provider ?? undefined)
						const sections = provider ? await provider.getDiscoverSections() : []
						return {
							id: entry.id,
							name: entry.name,
							meta: {
								id: entry.id,
								name: entry.name,
								version: entry.version,
								baseUrl: "",
								supportedLanguages: entry.enabledLanguages,
								supportsAuth: false,
								icon: entry.icon,
							},
							sections,
						}
					})
			)
			setProviders(enabledProviders)
		}
		loadProviders().catch(() => {})
	}, [installed, setProvider, setProviders])

	useEffect(() => {
		if (!repoUrl) {
			setIndex([])
			return
		}
		setLoading(true)
		setError(null)
		fetchExtensionIndex(repoUrl)
			.then((data) => setIndex(data))
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false))
	}, [repoUrl])

	const handleInstall = async (item: ExtensionIndexItem) => {
		setLoading(true)
		setError(null)
		try {
			const extension = await installExtension(item)
			const next = [...installed, { ...extension, order: installed.length }]
			setInstalled(next)
			await saveInstalledExtensions(next)
			setProviders([])
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to install")
		} finally {
			setLoading(false)
		}
	}

	const handleUninstall = async (id: string) => {
		setLoading(true)
		setError(null)
		try {
			await uninstallExtension(id)
			const next = installed.filter((entry) => entry.id !== id)
			setInstalled(next)
			await saveInstalledExtensions(next)
			setProvider(id, undefined)
			const enabledProviders = next.map((entry) => ({
				id: entry.id,
				name: entry.name,
				meta: {
					id: entry.id,
					name: entry.name,
					version: entry.version,
					baseUrl: "",
					supportedLanguages: entry.enabledLanguages,
					supportsAuth: false,
					icon: entry.icon,
				},
				sections: [],
			}))
			setProviders(enabledProviders)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to uninstall")
		} finally {
			setLoading(false)
		}
	}

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
				{loading ? (
					<View className="mt-4 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5">
						<Text className="text-sm text-neutral-300">Working…</Text>
					</View>
				) : null}
				{error ? (
					<View className="mt-4 rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5">
						<Text className="text-sm text-amber-100">{error}</Text>
					</View>
				) : null}
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
								<Text
									className="mt-3 rounded-full bg-neutral-800 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-neutral-200"
									onPress={loading ? undefined : () => handleUninstall(provider.id)}
								>
									Uninstall
								</Text>
							</View>
						))
					)}
					{index.length > 0 ? (
						<View className="gap-4">
							<Text className="text-xs uppercase tracking-[0.2em] text-neutral-500">
								Available
							</Text>
							{index.map((item) => {
								const isInstalled = installed.some((entry) => entry.id === item.id)
								return (
									<View
										key={item.id}
										className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5"
									>
										<Text className="text-base font-semibold text-white">
											{item.name}
										</Text>
										<Text className="mt-1 text-sm text-neutral-400">
											{item.languages.join(", ") || "No languages"}
										</Text>
										<Text
											className={`mt-3 rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] ${
												isInstalled
													? "bg-neutral-800 text-neutral-400"
													: "bg-amber-500 text-neutral-950"
											}`}
											onPress={
												isInstalled || loading ? undefined : () => handleInstall(item)
											}
										>
											{isInstalled ? "Installed" : "Install"}
										</Text>
									</View>
								)
							})}
						</View>
					) : null}
				</View>
			</ScrollView>
		</View>
	)
}
