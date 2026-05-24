import type { SearchViewState } from './types.js';

export const searchQueryKeys = {
  all: ['search'] as const,
  page: (viewState: SearchViewState, explicitContent = false) =>
    [...searchQueryKeys.all, 'page', viewState, explicitContent] as const,
};

export const discoverQueryKeys = {
  all: ['discover'] as const,
  providers: (explicitContent = false) =>
    [...discoverQueryKeys.all, 'providers', explicitContent] as const,
  section: (providerId: string, sectionId: string, explicitContent = false) =>
    [...discoverQueryKeys.all, 'section', providerId, sectionId, explicitContent] as const,
};
