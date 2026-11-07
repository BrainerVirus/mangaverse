import type { SearchViewState } from './types.js';

export const searchQueryKeys = {
  all: ['search'] as const,
  pages: () => [...searchQueryKeys.all, 'page'] as const,
  // Explicit content gates stored identities too, so the page read is partitioned by it.
  page: (viewState: SearchViewState, explicitContent = false) =>
    [...searchQueryKeys.pages(), viewState, explicitContent] as const,
  providers: () => [...searchQueryKeys.all, 'providers'] as const,
  provider: (providerId: string, query: string, explicitContent = false) =>
    [...searchQueryKeys.all, 'provider', providerId, query, explicitContent] as const,
  savedSearches: () => [...searchQueryKeys.all, 'saved-searches'] as const,
};

export const discoverQueryKeys = {
  all: ['discover'] as const,
  /** The installed-provider descriptors; independent of the content gate. */
  providers: () => [...discoverQueryKeys.all, 'providers'] as const,
  /** One six-cover section preview, independent from its paged `section` query. */
  preview: (providerId: string, sectionId: string, explicitContent = false) =>
    [...discoverQueryKeys.all, 'preview', providerId, sectionId, explicitContent] as const,
  section: (providerId: string, sectionId: string, explicitContent = false) =>
    [...discoverQueryKeys.all, 'section', providerId, sectionId, explicitContent] as const,
};
