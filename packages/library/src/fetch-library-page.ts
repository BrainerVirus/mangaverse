import type { AppDrizzleDb } from '@app/db';
import type { LibraryViewState } from '@app/shared';
import { filterLibraryItemsByQuery } from './filter-items.js';
import type { LibraryItem, LibraryPageData } from './types.js';

export async function fetchLibraryPage(
  db: AppDrizzleDb,
  viewState: LibraryViewState,
): Promise<LibraryPageData> {
  const { getMangaIdentity, listLibraryCategories, listLibraryEntries } = await import('@app/db');
  const { query, ...repoFilter } = viewState.filter;
  const [entries, categories] = await Promise.all([
    listLibraryEntries(db, {
      filter: repoFilter,
      sort: viewState.sort,
    }),
    listLibraryCategories(db),
  ]);

  const resolved = await Promise.all(
    entries.map(async (entry): Promise<LibraryItem | undefined> => {
      const manga = await getMangaIdentity(db, entry.mangaId);
      if (manga === undefined) {
        return undefined;
      }
      return { entry, manga };
    }),
  );

  const items = resolved.filter((item): item is LibraryItem => item !== undefined);
  const filtered =
    query !== undefined && query.trim().length > 0
      ? filterLibraryItemsByQuery(items, query)
      : items;

  return {
    items: filtered,
    categories,
    viewState,
  };
}
