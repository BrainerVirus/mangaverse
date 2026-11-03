import type { AppDrizzleDb } from '@app/db';
import { listDownloadsForManga } from '@app/db';
import type { MangaId } from '@app/shared';

import type { ChapterDownloadState } from './types.js';

/** One title's download rows, shaped for the chapter list. */
export async function fetchMangaDownloads(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<ChapterDownloadState[]> {
  const rows = await listDownloadsForManga(db, mangaId);
  return rows.map((row) => ({
    chapterId: row.chapterId as ChapterDownloadState['chapterId'],
    status: row.status,
    pageCount: row.pageCount,
    completedPages: row.completedPages,
    failedPages: row.failedPageIndexes.length,
  }));
}
