import type { AppDrizzleDb } from '@app/db';
import type { LibraryViewState } from '@app/shared';
import { filterLibraryItemsByQuery } from './filter-items.js';
import type { LibraryItem, LibraryPageData } from './types.js';

export async function fetchLibraryPage(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
): Promise<LibraryPageData> {
  const { getMangaIdentities, listLibraryCategories, listLibraryEntries, listLibraryProviderIds } =
    await import('@app/db');
  const { query, ...repoFilter } = viewState.filter;
  const [entries, categories, providers] = await Promise.all([
    listLibraryEntries(db, {
      filter: repoFilter,
      sort: viewState.sort,
    }),
    listLibraryCategories(db),
    listLibraryProviderIds(db),
  ]);

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
  const filtered =
    query !== undefined && query.trim().length > 0
      ? filterLibraryItemsByQuery(items, query)
      : items;

  return {
    items: filtered,
    categories,
    providers,
    viewState,
  };
}
