import type { AppDrizzleDb } from '@app/db';
import type { ChapterId, MangaId } from '@app/shared';
import { createProgressEvent } from './progress.js';
import type { ReaderProgressEvent } from './types.js';

/**
 * Per-chapter write chains serialize this tab's writes. The SQLite upserts
 * carry the same timestamp/furthest-progress guard, so this chain is an
 * intra-tab optimization, not the cross-tab ordering guarantee.
 */
const progressChains = new Map<string, Promise<void>>();

async function persistOnce(db: AppDrizzleDb, event: ReaderProgressEvent): Promise<void> {
  const {
    acceptChapterReadState,
    acceptLibraryResumeMetadata,
    appendReadingHistory,
    getChapterReadStateOrdering,
    getLibraryResumeOrdering,
    updateLibraryEntryReadingProgress,
    upsertChapterReadState,
  } = await import('@app/db');

  const existing = await getChapterReadStateOrdering(db, event.chapterId as ChapterId);

  // Ordering is event-vs-event: the stored timestamp is the creating event's
  // own timestamp. A stored write time would wrongly reject a newer event that
  // was created before an older event finished writing. Same-instant events keep
  // the furthest progress so a stale checkpoint cannot roll the page back.
  if (
    !acceptChapterReadState(existing, {
      timestamp: event.timestamp,
      pageIndex: event.pageIndex,
      readPercent: event.readPercent,
      completed: event.completed,
    })
  ) {
    return;
  }

  const progress = {
    readPercent: event.readPercent,
    lastPageIndex: event.pageIndex,
    completed: event.completed,
    updatedAt: event.timestamp,
    startedAt: existing?.startedAt ?? event.timestamp,
  };

  await upsertChapterReadState(db, {
    chapterId: event.chapterId as ChapterId,
    mangaId: event.mangaId as MangaId,
    progress,
  });

  // The chapter guard is chapter-local, so a stale event for *another* chapter
  // would still move "continue reading". The library entry carries the same
  // event-timestamp ordering, which rejects it.
  const libraryResume = await getLibraryResumeOrdering(db, event.mangaId as MangaId);
  if (
    acceptLibraryResumeMetadata(libraryResume, {
      timestamp: event.timestamp,
      readPercent: event.readPercent,
    })
  ) {
    await updateLibraryEntryReadingProgress(db, {
      mangaId: event.mangaId as MangaId,
      chapterId: event.chapterId as ChapterId,
      progressPercent: event.readPercent,
      updatedAt: event.timestamp,
    });
  }

  await appendReadingHistory(db, {
    mangaId: event.mangaId as MangaId,
    chapterId: event.chapterId as ChapterId,
  });
}

export async function persistReaderProgress(
  db: AppDrizzleDb,
  event: ReaderProgressEvent,
): Promise<void> {
  const key = String(event.chapterId);
  const previous = progressChains.get(key) ?? Promise.resolve();
  const run = previous.then(() => persistOnce(db, event));
  // Keep the chain alive on failure; the caller still observes the rejection.
  progressChains.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

export function buildProgressEvent(
  chapterId: string,
  mangaId: string,
  pageIndex: number,
  totalPages: number,
): ReaderProgressEvent {
  return createProgressEvent(chapterId, mangaId, pageIndex, totalPages);
}
