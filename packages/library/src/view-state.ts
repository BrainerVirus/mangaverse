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
