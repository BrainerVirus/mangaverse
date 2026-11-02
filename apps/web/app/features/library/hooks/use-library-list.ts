import type { AppDrizzleDb } from '@app/db';
import type { LibraryViewState } from '@app/shared';
import { useLiveQuery, type InitialQueryBuilder } from '@tanstack/react-db';
import type { ChangeFeed, HostListCollection } from '../../../lib/host-collections.js';
import { libraryCollections } from '../library-collections.js';
import type { LibraryItem, LibraryPageData } from '../types.js';

export interface LibraryList {
  readonly data: LibraryPageData | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** The view's titles, for optimistic edits; `null` until the database is ready. */
  readonly items: HostListCollection<LibraryItem> | null;
}

/** Rows in the host's order; no query while the database is not ready. */
function ordered<T>(collection: HostListCollection<T> | undefined) {
  return (q: InitialQueryBuilder) =>
    collection === undefined
      ? undefined
      : q.from({ row: collection }).orderBy(({ row }) => row.position, 'asc');
}

/** The library page's data, read live from the host-fed collections (#210 tracer). */
export function useLibraryList(
  db: AppDrizzleDb | null,
  viewState: LibraryViewState,
  subscribe: ChangeFeed,
): LibraryList {
  const collections = db === null ? undefined : libraryCollections(db, viewState, subscribe);
  const items = useLiveQuery({ query: ordered(collections?.items) });
  const categories = useLiveQuery({ query: ordered(collections?.categories) });
  const providers = useLiveQuery({ query: ordered(collections?.providers) });

  const isError = items.isLoadingError || categories.isLoadingError || providers.isLoadingError;
  const ready =
    collections !== undefined &&
    items.status === 'ready' &&
    categories.status === 'ready' &&
    providers.status === 'ready';
  return {
    data: ready
      ? {
          items: (items.data ?? []).map((row) => row.value),
          categories: (categories.data ?? []).map((row) => row.value),
          providers: (providers.data ?? []).map((row) => row.value.id),
          viewState,
        }
      : undefined,
    isLoading: !ready && !isError,
    isError,
    items: collections?.items ?? null,
  };
}
