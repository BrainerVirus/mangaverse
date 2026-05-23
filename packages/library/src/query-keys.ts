import type { LibraryViewState, MangaId } from '@app/shared';

export const libraryQueryKeys = {
  all: ['library'] as const,
  page: (viewState: LibraryViewState) =>
    [...libraryQueryKeys.all, 'page', viewState] as const,
  detail: (mangaId: MangaId) => [...libraryQueryKeys.all, 'detail', mangaId] as const,
};
