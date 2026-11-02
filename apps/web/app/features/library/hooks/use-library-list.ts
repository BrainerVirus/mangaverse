import type { AppDrizzleDb } from '@app/db';
import {
  LIBRARY_PAGE_MAX,
  type LibraryCategory,
  type LibraryViewState,
  type ProviderId,
} from '@app/shared';
import { useLiveQuery, type InitialQueryBuilder } from '@tanstack/react-db';
import type { ChangeFeed, HostListCollection } from '../../../lib/host-collections.js';
import { libraryCollections } from '../library-collections.js';
import type { LibraryItem, LibraryPageData } from '../types.js';

export interface LibraryList {
  readonly data: LibraryPageData | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** The view's loaded page, for optimistic edits; `null` until the database is ready. */
  readonly items: HostListCollection<LibraryItem> | null;
  /** How many titles the filter matches, loaded or not. */
  readonly total: number;
  /** True while rows remain past the loaded page. */
  readonly hasMore: boolean;
  /** Loads the next page; resolves once its rows are on screen. */
  readonly loadMore: () => Promise<void>;
}

const NO_MORE = (): Promise<void> => Promise.resolve();

/** Rows in the host's order; no query while the database is not ready. */
function ordered<T>(collection: HostListCollection<T> | undefined) {
  return (q: InitialQueryBuilder) =>
    collection === undefined
      ? undefined
      : q.from({ row: collection }).orderBy(({ row }) => row.position, 'asc');
}

/** A live query's rows as plain values, or none before the first load. */
function rowsOf<T>(query: { readonly data?: readonly { readonly value: T }[] | undefined }): T[] {
  return (query.data ?? []).map((row) => row.value);
}

const loadMoreOf = (collections: { loadMore(): Promise<void> } | undefined) =>
  collections === undefined ? NO_MORE : () => collections.loadMore();

function pageData(
  viewState: LibraryViewState,
  items: readonly LibraryItem[],
  total: number,
  categories: readonly LibraryCategory[],
  providers: readonly { readonly id: ProviderId }[],
): LibraryPageData {
  return {
    items,
    total,
    categories,
    providers: providers.map((provider) => provider.id),
    viewState,
  };
}

/** The library page's data, read live from the host-fed collections (#210 tracer). */
export function useLibraryList(
  db: AppDrizzleDb | null,
  viewState: LibraryViewState,
  subscribe: ChangeFeed,
): LibraryList {
  const collections = db === null ? undefined : libraryCollections(db, viewState, subscribe);
  const items = useLiveQuery({ query: ordered(collections?.items) });
  const total = useLiveQuery({ query: ordered(collections?.total) });
  const categories = useLiveQuery({ query: ordered(collections?.categories) });
  const providers = useLiveQuery({ query: ordered(collections?.providers) });

  const queries = [items, total, categories, providers];
  const isError = queries.some((query) => query.isLoadingError);
  const ready = collections !== undefined && queries.every((query) => query.status === 'ready');
  const rows = rowsOf(items);
  const totalCount = rowsOf(total)[0]?.total ?? 0;
  const loaded = collections?.items;

  return {
    data: ready
      ? pageData(viewState, rows, totalCount, rowsOf(categories), rowsOf(providers))
      : undefined,
    isLoading: !ready && !isError,
    isError,
    items: loaded ?? null,
    total: totalCount,
    hasMore: ready && rows.length < Math.min(totalCount, LIBRARY_PAGE_MAX),
    loadMore: loadMoreOf(collections),
  };
}
