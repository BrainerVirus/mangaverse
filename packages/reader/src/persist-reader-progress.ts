import type { AppDrizzleDb } from '@app/db';
import type { ChapterId, MangaId } from '@app/shared';
import { createProgressEvent } from './progress.js';
import type { ReaderProgressEvent } from './types.js';

export async function persistReaderProgress(
  db: AppDrizzleDb,
  event: ReaderProgressEvent,
): Promise<void> {
  const { appendReadingHistory, updateLibraryEntryReadingProgress, upsertChapterReadState } =
    await import('@app/db');

  const now = new Date().toISOString();
  const progress = {
    readPercent: event.readPercent,
    lastPageIndex: event.pageIndex,
    completed: event.completed,
    updatedAt: now,
    startedAt: now,
  };

  await upsertChapterReadState(db, {
    chapterId: event.chapterId as ChapterId,
    mangaId: event.mangaId as MangaId,
    progress,
  });

  await updateLibraryEntryReadingProgress(db, {
    mangaId: event.mangaId as MangaId,
    chapterId: event.chapterId as ChapterId,
    progressPercent: event.readPercent,
  });

  await appendReadingHistory(db, {
    mangaId: event.mangaId as MangaId,
    chapterId: event.chapterId as ChapterId,
  });
}

export function buildProgressEvent(
  chapterId: string,
  mangaId: string,
  pageIndex: number,
  totalPages: number,
): ReaderProgressEvent {
  return createProgressEvent(chapterId, mangaId, pageIndex, totalPages);
}
