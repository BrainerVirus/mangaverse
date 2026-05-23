import type { LibraryViewState } from '@app/shared';

export const libraryQueryKeys = {
  all: ['library'] as const,
  page: (viewState: LibraryViewState) =>
    [...libraryQueryKeys.all, 'page', viewState] as const,
};
