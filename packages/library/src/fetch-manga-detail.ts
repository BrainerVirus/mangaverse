import type { AppDrizzleDb } from '@app/db';
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
    listChaptersForManga,
    listLibraryCategories,
  } = await import('@app/db');

  const manga = await getMangaIdentity(db, mangaId);
  if (manga === undefined) {
    return null;
  }

  const [chapters, storedEntry, categories] = await Promise.all([
    listChaptersForManga(db, mangaId),
    getLibraryEntryForManga(db, mangaId),
    listLibraryCategories(db),
  ]);

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
  };
}
