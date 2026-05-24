import type { SearchViewState } from './types.js';

export const searchQueryKeys = {
  all: ['search'] as const,
  page: (viewState: SearchViewState, explicitContent = false) =>
    [...searchQueryKeys.all, 'page', viewState, explicitContent] as const,
};
