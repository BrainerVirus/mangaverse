import type { AppDrizzleDb } from '@app/db';
import type {
  ChapterId,
  LibraryEntry,
  LibraryFilter,
  MangaIdentity,
  ProviderMappingId,
} from '@app/shared';
import type { LibraryItem } from './types.js';

export const CONTINUE_READING_LIMIT = 6;
export const RECENTLY_UPDATED_LIMIT = 8;

export interface LibraryChapterRef {
  readonly id: ChapterId;
  readonly providerMappingId: ProviderMappingId;
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
 * Each shelf is selected and bounded in SQL (`listLibraryContinueReading`,
 * `listLibraryRecentlyUpdated`), so opening the library never loads every title's
 * chapters. Chapter stats are then read only for the handful of selected rows;
 * this is what keeps the overview off the 200,000-chapter path.
 *
 * "Recently updated" means chapters past the last read one, not a provider sync
 * timestamp: chapter `updatedAt` moves on every re-check and would fake a change.
 * Chapter indexes only compare inside one provider mapping; a provider switch can
 * renumber them, so across mappings the title's unread state decides.
 */
export async function fetchLibraryOverview(
  db: AppDrizzleDb,
  options: FetchLibraryOverviewOptions = {},
): Promise<LibraryOverviewData> {
  const {
    getLibraryChapterStats,
    getMangaIdentities,
    listLibraryContinueReading,
    listLibraryRecentlyUpdated,
  } = await import('@app/db');
  const continueLimit = options.continueLimit ?? CONTINUE_READING_LIMIT;
  const recentlyUpdatedLimit = options.recentlyUpdatedLimit ?? RECENTLY_UPDATED_LIMIT;
  const filter = options.filter;
  const query = filter === undefined ? {} : { filter };

  const [continueEntries, updatedEntries] = await Promise.all([
    listLibraryContinueReading(db, { ...query, limit: continueLimit }),
    listLibraryRecentlyUpdated(db, { ...query, limit: recentlyUpdatedLimit }),
  ]);
  if (continueEntries.length === 0 && updatedEntries.length === 0) {
    return { continueReading: [], recentlyUpdated: [] };
  }

  // One stats read for the union of both shelves, never the whole library.
  const byId = new Map<string, LibraryEntry>();
  for (const entry of [...continueEntries, ...updatedEntries]) byId.set(entry.id, entry);
  const selected = [...byId.values()];
  const [identities, stats] = await Promise.all([
    getMangaIdentities(
      db,
      selected.map((entry) => entry.mangaId),
    ),
    getLibraryChapterStats(db, selected),
  ]);
  const identityById = new Map<string, MangaIdentity>(
    identities.map((identity) => [identity.id, identity]),
  );

  const itemFor = (entry: LibraryEntry): LibraryOverviewItem | undefined => {
    const manga = identityById.get(entry.mangaId);
    if (manga === undefined) return undefined;
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
  };
  const continueItems = continueEntries.flatMap((entry) => itemFor(entry) ?? []);
  const updatedItems = updatedEntries.flatMap((entry) => itemFor(entry) ?? []);

  const continueReading = continueItems
    .filter((item) => item.item.entry.lastReadChapterId !== undefined)
    .sort(lastReadFirst)
    .slice(0, continueLimit);

  const recentlyUpdated = updatedItems
    .filter((item) => {
      const latest = item.latestChapter;
      if (item.unreadCount === 0 || latest === undefined) return false;
      const lastRead = item.lastReadChapter;
      if (lastRead === undefined || lastRead.providerMappingId !== latest.providerMappingId) {
        return true;
      }
      return latest.index > lastRead.index;
    })
    .sort(newestFirst)
    .slice(0, recentlyUpdatedLimit);

  return { continueReading, recentlyUpdated };
}
