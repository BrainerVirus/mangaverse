import type { AppDrizzleDb } from '@app/db';
import type { ChapterId, LibraryFilter } from '@app/shared';
import { filterLibraryItemsByQuery } from './filter-items.js';
import type { LibraryItem } from './types.js';

export const CONTINUE_READING_LIMIT = 6;
export const RECENTLY_UPDATED_LIMIT = 8;

export interface LibraryChapterRef {
  readonly id: ChapterId;
  readonly title: string;
  readonly index: number;
  /** When the provider released the chapter, when it says so. */
  readonly publishedAt?: string;
  /** First time the chapter was persisted; absent when the row predates timestamps. */
  readonly addedAt?: string;
}

export interface LibraryOverviewItem {
  readonly item: LibraryItem;
  readonly chapterCount: number;
  readonly unreadCount: number;
  readonly latestChapter?: LibraryChapterRef;
  readonly lastReadChapter?: LibraryChapterRef;
  readonly lastReadAt?: string;
}

export interface LibraryOverviewData {
  readonly continueReading: readonly LibraryOverviewItem[];
  readonly recentlyUpdated: readonly LibraryOverviewItem[];
}

export interface FetchLibraryOverviewOptions {
  /** The library page filters; the sections show the same narrowed set. */
  readonly filter?: LibraryFilter;
  readonly continueLimit?: number;
  readonly recentlyUpdatedLimit?: number;
}

function updatedAt(item: LibraryOverviewItem): string {
  return item.latestChapter?.publishedAt ?? item.latestChapter?.addedAt ?? '';
}

function newestFirst(a: LibraryOverviewItem, b: LibraryOverviewItem): number {
  const left = updatedAt(a);
  const right = updatedAt(b);
  if (left !== right) return left === '' ? 1 : right === '' ? -1 : right.localeCompare(left);
  const indexOrder = (b.latestChapter?.index ?? 0) - (a.latestChapter?.index ?? 0);
  if (indexOrder !== 0) return indexOrder;
  return a.item.manga.canonicalTitle.localeCompare(b.item.manga.canonicalTitle);
}

function lastReadFirst(a: LibraryOverviewItem, b: LibraryOverviewItem): number {
  const left = a.lastReadAt ?? a.item.entry.updatedAt ?? '';
  const right = b.lastReadAt ?? b.item.entry.updatedAt ?? '';
  if (left !== right) return left === '' ? 1 : right === '' ? -1 : right.localeCompare(left);
  return a.item.manga.canonicalTitle.localeCompare(b.item.manga.canonicalTitle);
}

/**
 * Continue reading and recently updated, read from local SQLite only: opening
 * the library never waits on a provider. Both sections apply the page filter,
 * so a category or status filter narrows the sections with the grid.
 *
 * "Recently updated" means chapters past the last read one, not a provider sync
 * timestamp: chapter `updatedAt` moves on every re-check and would fake a change.
 */
export async function fetchLibraryOverview(
  db: AppDrizzleDb,
  options: FetchLibraryOverviewOptions = {},
): Promise<LibraryOverviewData> {
  const { getLibraryChapterStats, getMangaIdentities, listLibraryEntries } =
    await import('@app/db');
  const entries = await listLibraryEntries(
    db,
    options.filter === undefined ? undefined : { filter: options.filter },
  );
  if (entries.length === 0) return { continueReading: [], recentlyUpdated: [] };

  const identities = await getMangaIdentities(
    db,
    entries.map((entry) => entry.mangaId),
  );
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const visible = entries.flatMap((entry): LibraryItem[] => {
    const manga = identityById.get(entry.mangaId);
    return manga === undefined ? [] : [{ entry, manga }];
  });
  // `listLibraryEntries` handles every structured filter; the free-text query
  // is applied here with the same matcher the grid uses.
  const matchedIds = new Set(
    filterLibraryItemsByQuery(visible, options.filter?.query ?? '').map((item) => item.entry.id),
  );
  const selected = visible.filter((item) => matchedIds.has(item.entry.id));

  const stats = await getLibraryChapterStats(
    db,
    selected.map((item) => item.entry),
  );
  const items = selected.map(({ entry, manga }): LibraryOverviewItem => {
    const entryStats = stats.get(entry.id);
    return {
      item: { entry, manga },
      chapterCount: entryStats?.chapterCount ?? 0,
      unreadCount:
        entryStats === undefined || entryStats.chapterCount === 0
          ? entry.unreadCount
          : entryStats.unreadCount,
      ...(entryStats?.latestChapter === undefined
        ? {}
        : { latestChapter: entryStats.latestChapter }),
      ...(entryStats?.lastReadChapter === undefined
        ? {}
        : { lastReadChapter: entryStats.lastReadChapter }),
      ...(entryStats?.lastReadAt === undefined ? {} : { lastReadAt: entryStats.lastReadAt }),
    };
  });

  const continueReading = items
    .filter((item) => item.item.entry.lastReadChapterId !== undefined)
    .sort(lastReadFirst)
    .slice(0, options.continueLimit ?? CONTINUE_READING_LIMIT);

  const recentlyUpdated = items
    .filter((item) => {
      if (item.unreadCount === 0 || item.latestChapter === undefined) return false;
      return (
        item.lastReadChapter === undefined || item.latestChapter.index > item.lastReadChapter.index
      );
    })
    .sort(newestFirst)
    .slice(0, options.recentlyUpdatedLimit ?? RECENTLY_UPDATED_LIMIT);

  return { continueReading, recentlyUpdated };
}
