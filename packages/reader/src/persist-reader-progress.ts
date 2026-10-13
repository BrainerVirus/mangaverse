import type { AppDrizzleDb } from '@app/db';
import type { ChapterId, MangaId } from '@app/shared';
import { createProgressEvent } from './progress.js';
import type { ReaderProgressEvent } from './types.js';

export async function persistReaderProgress(
  db: AppDrizzleDb,
  event: ReaderProgressEvent,
): Promise<void> {
  const {
    appendReadingHistory,
    getChapterReadState,
    updateLibraryEntryReadingProgress,
    upsertChapterReadState,
  } = await import('@app/db');

  // A stale event must never roll progress back: a duplicated reader instance
  // (or a late unmount checkpoint) can carry an event created before the stored
  // one. Legitimate events are always created after the write they follow.
  const existing = await getChapterReadState(db, event.chapterId as ChapterId);
  if (
    existing !== undefined &&
    existing.progress.updatedAt !== undefined &&
    existing.progress.updatedAt > event.timestamp
  ) {
    return;
  }

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
