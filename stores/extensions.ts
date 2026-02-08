import { create } from "zustand"

import { DEFAULT_EXTENSION_REPO } from "@lib/constants"
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
	setRepoUrl: (url: string) => void
	setInstalled: (extensions: InstalledExtension[]) => void
	setProvider: (id: string, provider?: ProviderContract) => void
	setProviders: (providers: ProviderState[]) => void
	setSelectedProvider: (id?: string) => void
}

export const useExtensionsStore = create<ExtensionsState>((set) => ({
	repoUrl: DEFAULT_EXTENSION_REPO,
	installed: [],
	providers: {},
	enabledProviders: [],
	selectedProviderId: undefined,
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
}))
