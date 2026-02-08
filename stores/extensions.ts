import { create } from "zustand"

import { DEFAULT_EXTENSION_REPO } from "@lib/constants"
import type { ProviderDiscoverSection, ProviderMeta } from "../types/provider"

interface ProviderState {
	id: string
	name: string
	meta: ProviderMeta
	sections: ProviderDiscoverSection[]
}

interface ExtensionsState {
	repoUrl: string
	enabledProviders: ProviderState[]
	selectedProviderId?: string
	setRepoUrl: (url: string) => void
	setProviders: (providers: ProviderState[]) => void
	setSelectedProvider: (id?: string) => void
}

export const useExtensionsStore = create<ExtensionsState>((set) => ({
	repoUrl: DEFAULT_EXTENSION_REPO,
	enabledProviders: [],
	selectedProviderId: undefined,
	setRepoUrl: (url) => set({ repoUrl: url }),
	setProviders: (providers) =>
		set({
			enabledProviders: providers,
			selectedProviderId: providers[0]?.id,
		}),
	setSelectedProvider: (id) => set({ selectedProviderId: id }),
}))
