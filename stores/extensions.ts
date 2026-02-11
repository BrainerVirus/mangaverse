import { create } from "zustand"

import { DEFAULT_EXTENSION_REPO } from "@lib/constants"
import { loadInstalledExtensions, loadProviderFromExtension } from "@services/extensions/manager"
import type { InstalledExtension } from "../types/extension"
import type { ProviderContract, ProviderDiscoverSection, ProviderMeta } from "../types/provider"

export interface ProviderState {
	id: string
	name: string
	meta: ProviderMeta
	sections: ProviderDiscoverSection[]
}

interface ExtensionsState {
	repoUrl: string
	installed: InstalledExtension[]
	providers: Record<string, ProviderContract>
	enabledProviders: ProviderState[]
	selectedProviderId?: string
	loadErrors: Record<string, string>
	setRepoUrl: (url: string) => void
	setInstalled: (extensions: InstalledExtension[]) => void
	setProvider: (id: string, provider?: ProviderContract) => void
	setProviders: (providers: ProviderState[]) => void
	setSelectedProvider: (id?: string) => void
	refreshProviders: () => Promise<void>
}

export const useExtensionsStore = create<ExtensionsState>((set) => ({
	repoUrl: DEFAULT_EXTENSION_REPO,
	installed: [],
	providers: {},
	enabledProviders: [],
	selectedProviderId: undefined,
	loadErrors: {},
	setRepoUrl: (url) => set({ repoUrl: url }),
	setInstalled: (extensions) => set({ installed: extensions }),
	setProvider: (id, provider) =>
		set((state) => ({
			providers: provider
				? { ...state.providers, [id]: provider }
				: Object.fromEntries(Object.entries(state.providers).filter(([key]) => key !== id)),
		})),
	setProviders: (providers) =>
		set({
			enabledProviders: providers,
			selectedProviderId: providers[0]?.id,
		}),
	setSelectedProvider: (id) => set({ selectedProviderId: id }),
	refreshProviders: async () => {
		const installed = await loadInstalledExtensions()
		const enabled = installed.filter((entry) => entry.enabled).sort((a, b) => a.order - b.order)
		const providersMap: Record<string, ProviderContract> = {}
		const loadErrors: Record<string, string> = {}
		const enabledProviders = await Promise.all(
			enabled.map(async (entry) => {
				let provider: ProviderContract | undefined
				try {
					provider = await loadProviderFromExtension(entry)
					providersMap[entry.id] = provider
				} catch (error) {
					loadErrors[entry.id] =
						error instanceof Error ? error.message : "Failed to load provider"
				}
				const sections = provider
					? await provider.getDiscoverSections().then((base) => {
							const hasGenres = base.some((section) => section.id === "genres")
							return hasGenres ? base : [{ id: "genres", title: "Genres", items: [] }, ...base]
						})
					: ([] as ProviderDiscoverSection[])
				return {
					id: entry.id,
					name: entry.name,
					meta: {
						id: entry.id,
						name: entry.name,
						version: entry.version,
						baseUrl: provider?.meta.baseUrl ?? "",
						supportedLanguages: entry.enabledLanguages,
						supportsAuth: false,
						icon: provider?.meta.icon ?? entry.icon,
					},
					sections,
				}
			})
		)
		set((state) => {
			const nextSelected = enabledProviders.some((entry) => entry.id === state.selectedProviderId)
				? state.selectedProviderId
				: enabledProviders[0]?.id
			return {
				installed,
				providers: providersMap,
				enabledProviders,
				loadErrors,
				selectedProviderId: nextSelected,
			}
		})
	},
}))
