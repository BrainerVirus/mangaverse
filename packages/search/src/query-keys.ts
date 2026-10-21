import type { SearchViewState } from './types.js';

export const searchQueryKeys = {
  all: ['search'] as const,
  // Local identities and recents do not depend on explicit content, so they are
  // not partitioned by it.
  page: (viewState: SearchViewState) => [...searchQueryKeys.all, 'page', viewState] as const,
  provider: (query: string, explicitContent = false) =>
    [...searchQueryKeys.all, 'provider', query, explicitContent] as const,
};

export const discoverQueryKeys = {
  all: ['discover'] as const,
  providers: (explicitContent = false) =>
    [...discoverQueryKeys.all, 'providers', explicitContent] as const,
  section: (providerId: string, sectionId: string, explicitContent = false) =>
    [...discoverQueryKeys.all, 'section', providerId, sectionId, explicitContent] as const,
};
