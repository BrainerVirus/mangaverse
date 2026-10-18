import { eq } from 'drizzle-orm';
import type { ChapterId, MangaId } from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { chapterReadState, libraryEntries } from '../schema.js';
import {
  hasLibraryResume,
  libraryResumeWins,
  progressOrderingWins,
  type ProgressOrderingRecord,
} from '../progress-ordering.js';

/**
 * True when an incoming chapter progress event may replace the stored read
 * state. `progressOrderingWins` carries the timestamp and tie-break policy.
 */
export function acceptChapterReadState(
  existing:
    | {
        readonly updatedAt: string | null | undefined;
        readonly lastPageIndex: number;
        readonly readPercent: number;
        readonly completed: boolean;
      }
    | undefined,
  incoming: ProgressOrderingRecord,
): boolean {
  const storedTimestamp = existing?.updatedAt;
  if (
    existing === undefined ||
    storedTimestamp === null ||
    storedTimestamp === undefined ||
    storedTimestamp === ''
  ) {
    return true;
  }
  return progressOrderingWins(incoming, {
    timestamp: storedTimestamp,
    pageIndex: existing.lastPageIndex,
    readPercent: existing.readPercent,
    completed: existing.completed,
  });
}

/**
 * Library resume metadata ("continue reading") carries the same ordering rule as
 * chapter read state, so a stale event for another chapter cannot move it back.
 * The library's `updatedAt` is the event timestamp of the last accepted write.
 */
export function acceptLibraryResumeMetadata(
  existing:
    | {
        readonly updatedAt: string | null | undefined;
        readonly lastReadChapterId: string | null | undefined;
        readonly progressPercent: number | null | undefined;
      }
    | undefined,
  incoming: { readonly timestamp: string; readonly readPercent: number },
): boolean {
  if (existing === undefined || !hasLibraryResume(existing)) return true;
  return libraryResumeWins(incoming, {
    timestamp: existing.updatedAt,
    readPercent: existing.progressPercent,
  });
}

/** Reads the fields the ordering guards need from one chapter's read state. */
export async function getChapterReadStateOrdering(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<
  | {
      readonly updatedAt: string | null;
      readonly startedAt: string | null;
      readonly lastPageIndex: number;
      readonly readPercent: number;
      readonly completed: boolean;
    }
  | undefined
> {
  const row = db
    .select({
      updatedAt: chapterReadState.updatedAt,
      startedAt: chapterReadState.startedAt,
      lastPageIndex: chapterReadState.lastPageIndex,
      readPercent: chapterReadState.readPercent,
      completed: chapterReadState.completed,
    })
    .from(chapterReadState)
    .where(eq(chapterReadState.chapterId, chapterId))
    .get();
  return row;
}

/** Reads the fields the resume-metadata guard needs from a library entry. */
export async function getLibraryResumeOrdering(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<
  | {
      readonly updatedAt: string | null;
      readonly lastReadChapterId: string | null;
      readonly progressPercent: number | null;
    }
  | undefined
> {
  return db
    .select({
      updatedAt: libraryEntries.updatedAt,
      lastReadChapterId: libraryEntries.lastReadChapterId,
      progressPercent: libraryEntries.progressPercent,
    })
    .from(libraryEntries)
    .where(eq(libraryEntries.mangaId, mangaId))
    .get();
}
