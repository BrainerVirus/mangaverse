import type { SearchViewState } from './types.js';

export const searchQueryKeys = {
  all: ['search'] as const,
  page: (viewState: SearchViewState) => [...searchQueryKeys.all, 'page', viewState] as const,
};
