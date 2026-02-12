import { useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { ActivityIndicator, ScrollView, Text, View } from "react-native"

import { GradientBackdrop } from "@components/GradientBackdrop"
import {
	installExtensionFromUrl,
	loadInstalledExtensions,
	saveInstalledExtensions,
} from "@services/extensions/manager"
import { useExtensionsStore } from "@stores/extensions"

const parseLanguages = (raw?: string | string[]) => {
	if (!raw) {
		return [] as string[]
	}
	const value = Array.isArray(raw) ? raw.join(",") : raw
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
}

const parseBoolean = (raw?: string | string[]) => {
	if (!raw) {
		return undefined
	}
	const value = Array.isArray(raw) ? raw[0] : raw
	if (value === "true") {
		return true
	}
	if (value === "false") {
		return false
	}
	return undefined
}

export default function ExtensionInstall() {
	const params = useLocalSearchParams()
	const router = useRouter()
	const setInstalled = useExtensionsStore((state) => state.setInstalled)
	const refreshProviders = useExtensionsStore((state) => state.refreshProviders)
	const [status, setStatus] = useState<"idle" | "installing" | "done" | "error">("idle")
	const [message, setMessage] = useState<string | null>(null)
	const extensionParams = useMemo(() => {
		const bundleUrl = typeof params.bundle === "string" ? params.bundle : ""
		return {
			bundleUrl,
			id: typeof params.id === "string" ? params.id : undefined,
			name: typeof params.name === "string" ? params.name : undefined,
			version: typeof params.version === "string" ? params.version : undefined,
			icon: typeof params.icon === "string" ? params.icon : undefined,
			languages: parseLanguages(params.languages),
			nsfw: parseBoolean(params.nsfw),
			minAppVersion: typeof params.minAppVersion === "string" ? params.minAppVersion : undefined,
		}
	}, [params])

	const handleInstall = async () => {
		if (!extensionParams.bundleUrl || status === "installing") {
			return
		}
		setStatus("installing")
		setMessage(null)
		try {
			const extension = await installExtensionFromUrl(extensionParams)
			const installed = await loadInstalledExtensions()
			const existing = installed.find((item) => item.id === extension.id)
			const next = existing
				? installed.map((item) =>
						item.id === extension.id ? { ...extension, order: item.order } : item
					)
				: [...installed, { ...extension, order: installed.length }]
			setInstalled(next)
			await saveInstalledExtensions(next)
			await refreshProviders()
			setStatus("done")
		} catch (err) {
			setMessage(err instanceof Error ? err.message : "Failed to install extension")
			setStatus("error")
		}
	}

	const title =
		status === "installing"
			? "Installing extension"
			: status === "done"
				? "Extension installed"
				: status === "error"
					? "Install failed"
					: "Review extension"

	return (
		<View className="flex-1 bg-neutral-950">
			<GradientBackdrop />
			<ScrollView className="flex-1 px-5 pt-6">
				<View className="rounded-[28px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-base font-semibold text-white">{title}</Text>
					<Text className="mt-2 text-sm text-neutral-400">
						{extensionParams.name || "Unknown extension"}
					</Text>
					<Text className="mt-1 text-xs tracking-[0.2em] text-neutral-500 uppercase">
						{extensionParams.id ?? ""}
					</Text>
					<Text className="mt-3 text-sm text-neutral-400">
						Install this extension from a shared link. Only continue if you trust the source.
					</Text>
					{status === "installing" ? (
						<View className="mt-4 flex-row items-center gap-3">
							<ActivityIndicator color="#ff9900" />
							<Text className="text-sm text-neutral-300">Downloading bundle…</Text>
						</View>
					) : null}
					{status === "done" ? (
						<Text className="mt-4 text-sm text-emerald-200">
							Extension is ready. You can return to settings.
						</Text>
					) : null}
					{status === "error" ? (
						<Text className="mt-4 text-sm text-amber-100">{message ?? "Failed to install."}</Text>
					) : null}
					<View className="mt-4 flex-row gap-3">
						<Text
							className="flex-1 rounded-full border border-neutral-700 px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] text-neutral-300 uppercase"
							onPress={() => router.replace("/settings/extensions")}
						>
							Cancel
						</Text>
						<Text
							className={`flex-1 rounded-full px-4 py-2 text-center text-xs font-semibold tracking-[0.2em] uppercase ${
								!extensionParams.bundleUrl || status === "installing"
									? "bg-neutral-800 text-neutral-400"
									: "bg-amber-500 text-neutral-950"
							}`}
							onPress={
								!extensionParams.bundleUrl || status === "installing" ? undefined : handleInstall
							}
						>
							Install
						</Text>
					</View>
				</View>
				<View className="mt-5 rounded-[26px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-xs tracking-[0.2em] text-neutral-500 uppercase">Bundle URL</Text>
					<Text className="mt-2 text-sm text-neutral-300">
						{extensionParams.bundleUrl || "Missing bundle URL"}
					</Text>
				</View>
				<View className="mt-5 rounded-[26px] border border-white/5 bg-neutral-900/70 p-5">
					<Text className="text-xs tracking-[0.2em] text-neutral-500 uppercase">Metadata</Text>
					<Text className="mt-2 text-sm text-neutral-300">
						Version: {extensionParams.version ?? "0.0.0"}
					</Text>
					<Text className="mt-1 text-sm text-neutral-300">
						Languages: {extensionParams.languages.join(", ") || "Unknown"}
					</Text>
					<Text className="mt-1 text-sm text-neutral-300">
						NSFW: {extensionParams.nsfw === undefined ? "Unknown" : String(extensionParams.nsfw)}
					</Text>
					{extensionParams.minAppVersion ? (
						<Text className="mt-1 text-sm text-neutral-300">
							Min app: {extensionParams.minAppVersion}
						</Text>
					) : null}
				</View>
			</ScrollView>
		</View>
	)
}
