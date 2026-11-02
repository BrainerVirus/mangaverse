import type { AppDrizzleDb } from '@app/db';
import type { LibraryViewState } from '@app/shared';
import { filterLibraryItemsByQuery } from './filter-items.js';
import type { LibraryItem, LibraryPageData } from './types.js';

/** The library's titles for a view, filtered and in the view's order. */
export async function fetchLibraryItems(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
): Promise<LibraryItem[]> {
  const { getMangaIdentities, listLibraryEntries } = await import('@app/db');
  const { query, ...repoFilter } = viewState.filter;
  const entries = await listLibraryEntries(db, {
    filter: repoFilter,
    sort: viewState.sort,
  });

  const identities = await getMangaIdentities(
    db,
    entries.map((entry) => entry.mangaId),
  );
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));

  const resolved = entries.map((entry): LibraryItem | undefined => {
    const manga = identityById.get(entry.mangaId);
    return manga === undefined ? undefined : { entry, manga };
  });

  const items = resolved.filter((item): item is LibraryItem => item !== undefined);
  return query !== undefined && query.trim().length > 0
    ? filterLibraryItemsByQuery(items, query)
    : items;
}

export async function fetchLibraryPage(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
): Promise<LibraryPageData> {
  const { listLibraryCategories, listLibraryProviderIds } = await import('@app/db');
  const [items, categories, providers] = await Promise.all([
    fetchLibraryItems(db, viewState),
    listLibraryCategories(db),
    listLibraryProviderIds(db),
  ]);

  return {
    items,
    categories,
    providers,
    viewState,
  };
}
