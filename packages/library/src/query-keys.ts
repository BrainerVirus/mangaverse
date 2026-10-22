import type { LibraryFilter, LibraryViewState, MangaId } from '@app/shared';

export const libraryQueryKeys = {
  all: ['library'] as const,
  page: (viewState: LibraryViewState) => [...libraryQueryKeys.all, 'page', viewState] as const,
  detail: (mangaId: MangaId) => [...libraryQueryKeys.all, 'detail', mangaId] as const,
  recent: (limit: number) => [...libraryQueryKeys.all, 'recent', limit] as const,
  overview: (filter: LibraryFilter) => [...libraryQueryKeys.all, 'overview', filter] as const,
  updateReport: () => [...libraryQueryKeys.all, 'update-report'] as const,
};
