import type { AppDrizzleDb } from '@app/db';
import type { ChapterId, MangaId } from '@app/shared';
import type { MangaDetailData } from './types.js';

export async function fetchMangaDetail(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<MangaDetailData | undefined> {
  const { getLibraryEntryForManga, getMangaIdentity, listChaptersForManga } = await import('@app/db');

  const manga = await getMangaIdentity(db, mangaId);
  if (manga === undefined) {
    return undefined;
  }

  const [chapters, libraryEntry] = await Promise.all([
    listChaptersForManga(db, mangaId),
    getLibraryEntryForManga(db, mangaId),
  ]);

  const continueChapterId: ChapterId | undefined =
    libraryEntry?.lastReadChapterId ?? chapters[0]?.id;

  return {
    manga,
    chapters,
    libraryEntry,
    continueChapterId,
  };
}
