import type { AppDrizzleDb } from '@app/db';
import type { LibraryEntry, LibraryEntryId, LibraryViewState } from '@app/shared';
import type { LibraryItem, LibraryPageData } from './types.js';

/** The first page a view loads; more pages are asked for as the user scrolls. */
export const LIBRARY_PAGE_SIZE = 200;

export interface LibraryPageRequest {
  readonly limit?: number;
  readonly offset?: number;
}

export interface LibraryItemPage {
  readonly items: LibraryItem[];
  readonly total: number;
}

/**
 * One bounded page of a view, filtered, ordered and counted by SQLite. The text query
 * is part of the filter, so a match on page three is found even though page one is loaded.
 */
export async function fetchLibraryItems(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
  request: LibraryPageRequest = {},
): Promise<LibraryItemPage> {
  const { listLibraryEntryPage } = await import('@app/db');
  const page = await listLibraryEntryPage(db, {
    filter: viewState.filter,
    sort: viewState.sort,
    limit: request.limit ?? LIBRARY_PAGE_SIZE,
    ...(request.offset === undefined ? {} : { offset: request.offset }),
  });
  return { items: await withIdentities(db, page.items), total: page.total };
}

/**
 * One title as the view shows it, read on its own: undefined when it does not match the
 * view's filter, or ranks after `before` in the view's order. A row refresh reads this
 * instead of the whole page.
 */
export async function fetchLibraryItem(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
  entryId: LibraryEntryId,
  before?: LibraryEntryId,
): Promise<LibraryItem | undefined> {
  const { listLibraryEntryPage } = await import('@app/db');
  const page = await listLibraryEntryPage(db, {
    filter: viewState.filter,
    sort: viewState.sort,
    entryIds: before === undefined ? [entryId] : [entryId, before],
    limit: 1,
  });
  const entries = page.items.filter((entry) => entry.id === entryId);
  return (await withIdentities(db, entries))[0];
}

async function withIdentities(
  db: AppDrizzleDb,
  entries: readonly LibraryEntry[],
): Promise<LibraryItem[]> {
  const { getMangaIdentities } = await import('@app/db');
  const identities = await getMangaIdentities(
    db,
    entries.map((entry) => entry.mangaId),
  );
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  return entries.flatMap((entry): LibraryItem[] => {
    const manga = identityById.get(entry.mangaId);
    return manga === undefined ? [] : [{ entry, manga }];
  });
}

/**
 * The match count for a view on its own, so a page can show "200 of 1,000" without
 * loading the rest. The page query bounds rows, never the count.
 */
export async function fetchLibraryTotal(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
): Promise<number> {
  const { listLibraryEntryPage } = await import('@app/db');
  const page = await listLibraryEntryPage(db, { filter: viewState.filter, limit: 0 });
  return page.total;
}

export async function fetchLibraryPage(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
  request: LibraryPageRequest = {},
): Promise<LibraryPageData> {
  const { listLibraryCategories, listLibraryProviderIds } = await import('@app/db');
  const [page, categories, providers] = await Promise.all([
    fetchLibraryItems(db, viewState, request),
    listLibraryCategories(db),
    listLibraryProviderIds(db),
  ]);

  return {
    items: page.items,
    total: page.total,
    categories,
    providers,
    viewState,
  };
}
