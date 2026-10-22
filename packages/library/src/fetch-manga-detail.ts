import type { AppDrizzleDb } from '@app/db';
import { PAGE_CACHE_KIND } from '@app/cache';
import type { ChapterId, MangaId } from '@app/shared';
import type { MangaDetailData } from './types.js';

export async function fetchMangaDetail(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<MangaDetailData | null> {
  const {
    getLibraryEntryForManga,
    getLibraryEntryUnreadCount,
    getMangaIdentity,
    listCacheEntriesForManga,
    listChapterReadStatesForManga,
    listChaptersForManga,
    listLibraryCategories,
  } = await import('@app/db');

  const manga = await getMangaIdentity(db, mangaId);
  if (manga === undefined) {
    return null;
  }

  const [chapters, storedEntry, categories, readStates] = await Promise.all([
    listChaptersForManga(db, mangaId),
    getLibraryEntryForManga(db, mangaId),
    listLibraryCategories(db),
    listChapterReadStatesForManga(db, mangaId),
  ]);

  // The cache table is keyed by provider, so one read per attached provider is
  // enough; a chapter id identifies its mapping's chapter, not just the title's.
  const providerIds = [...new Set(manga.providerMappings.map((mapping) => mapping.providerId))];
  const cacheEntries = await Promise.all(
    providerIds.map((providerId) => listCacheEntriesForManga(db, providerId, mangaId)),
  );
  const downloadedChapterIds = [
    ...new Set(
      cacheEntries
        .flat()
        .filter((entry) => entry.cacheKind === PAGE_CACHE_KIND && entry.chapterId !== undefined)
        .map((entry) => entry.chapterId as ChapterId),
    ),
  ];

  // Read state changes in the reader; the stored count would otherwise go
  // stale until the next library update check.
  const libraryEntry =
    storedEntry === undefined
      ? undefined
      : {
          ...storedEntry,
          unreadCount: await getLibraryEntryUnreadCount(db, storedEntry),
        };

  const continueChapterId: ChapterId | undefined =
    libraryEntry?.lastReadChapterId ?? chapters[0]?.id;

  return {
    manga,
    chapters,
    libraryEntry,
    continueChapterId,
    categories,
    readStates,
    downloadedChapterIds,
  };
}
