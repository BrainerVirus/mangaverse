import type { LibraryViewState } from '@app/shared';

export const DEFAULT_LIBRARY_VIEW_STATE: LibraryViewState = {
  layout: 'grid',
  sort: { key: 'date_added', direction: 'desc' },
  filter: {},
};

export function withLibraryLayout(
  viewState: LibraryViewState,
  layout: LibraryViewState['layout'],
): LibraryViewState {
  return { ...viewState, layout };
}

export function hasLibraryFilters(filter: LibraryViewState['filter']): boolean {
  return (
    (filter.query ?? '').trim().length > 0 ||
    (filter.categoryIds?.length ?? 0) > 0 ||
    (filter.statuses?.length ?? 0) > 0 ||
    filter.favoritesOnly === true ||
    (filter.providerIds?.length ?? 0) > 0
  );
}
