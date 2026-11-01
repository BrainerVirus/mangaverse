import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  toChapterId,
  toMangaId,
  toProviderMappingId,
  type ChapterId,
  type ChapterReadState,
  type MangaId,
  type ProviderMappingId,
  type ReadingProgress,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import {
  chapterReadState,
  chapterPages,
  chapters,
  libraryEntries,
  readingHistory,
} from '../schema.js';

function newId(): string {
  return crypto.randomUUID();
}

export async function upsertChapterReadState(
  db: AppDrizzleDb,
  input: ChapterReadState,
): Promise<AppResult<void>> {
  const chapter = db
    .select({ id: chapters.id, mangaId: chapters.mangaId })
    .from(chapters)
    .where(eq(chapters.id, input.chapterId))
    .get();
  if (chapter === undefined) {
    return err(
      createAppError({ code: 'db.read_state.chapter_missing', message: 'Chapter does not exist.' }),
    );
  }
  if (chapter.mangaId !== input.mangaId) {
    return err(
      createAppError({
        code: 'db.read_state.manga_chapter_mismatch',
        message: 'Chapter does not belong to the given manga.',
      }),
    );
  }

  const now = new Date().toISOString();
  await db
    .insert(chapterReadState)
    .values({
      chapterId: input.chapterId,
      mangaId: input.mangaId,
      providerMappingId: input.providerMappingId,
      readPercent: input.progress.readPercent,
      lastPageIndex: input.progress.lastPageIndex,
      completed: input.progress.completed,
      startedAt: input.progress.startedAt,
      updatedAt: input.progress.updatedAt ?? now,
    })
    .onConflictDoUpdate({
      target: chapterReadState.chapterId,
      // Atomic guard for concurrent tabs/reloads: a stale event must not move
      // progress backwards, even though the reader also has an in-memory chain.
      setWhere: sql`(
        ${chapterReadState.updatedAt} IS NULL
        OR ${chapterReadState.updatedAt} = ''
        OR excluded.updated_at > ${chapterReadState.updatedAt}
        OR (
          excluded.updated_at = ${chapterReadState.updatedAt}
          AND (
            excluded.last_page_index > ${chapterReadState.lastPageIndex}
            OR (
              excluded.last_page_index = ${chapterReadState.lastPageIndex}
              AND (
                excluded.read_percent > ${chapterReadState.readPercent}
                OR (
                  excluded.read_percent = ${chapterReadState.readPercent}
                  AND excluded.completed > ${chapterReadState.completed}
                )
              )
            )
          )
        )
      )`,
      set: {
        mangaId: input.mangaId,
        providerMappingId: input.providerMappingId,
        readPercent: input.progress.readPercent,
        lastPageIndex: input.progress.lastPageIndex,
        completed: input.progress.completed,
        startedAt: input.progress.startedAt,
        updatedAt: input.progress.updatedAt ?? now,
      },
    });

  return ok(undefined);
}

/**
 * Recomputes the library badge from durable read state instead of decrementing
 * it: marking previous chapters or unmarking one keeps the same count truthful.
 * Scoped to the chapter's provider mapping so another mapping can never change
 * this mapping's unread count, even when both come from the same provider.
 */
export async function refreshLibraryUnreadCount(
  db: AppDrizzleDb,
  mangaId: MangaId,
  providerMappingId?: ProviderMappingId,
): Promise<number> {
  const rows = db
    .select({ completed: chapterReadState.completed })
    .from(chapters)
    .leftJoin(chapterReadState, eq(chapterReadState.chapterId, chapters.id))
    .where(
      providerMappingId === undefined
        ? eq(chapters.mangaId, mangaId)
        : and(eq(chapters.mangaId, mangaId), eq(chapters.providerMappingId, providerMappingId)),
    )
    .all();
  const unreadCount = rows.filter((row) => row.completed !== true).length;
  await db.update(libraryEntries).set({ unreadCount }).where(eq(libraryEntries.mangaId, mangaId));
  return unreadCount;
}

/**
 * Recomputes the badge after a reader-driven natural completion, where only the
 * chapter's own mapping count may change.
 */
export async function refreshLibraryUnreadCountForChapter(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<number | undefined> {
  const chapter = db
    .select({ mangaId: chapters.mangaId, providerMappingId: chapters.providerMappingId })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .get();
  if (chapter === undefined) return undefined;
  return refreshLibraryUnreadCount(
    db,
    toMangaId(chapter.mangaId),
    toProviderMappingId(chapter.providerMappingId),
  );
}

/**
 * Explicit mark read/unread from the reader. The upsert is guarded by timestamp,
 * so this wins over an older progress write, while a newer progress write still
 * wins over it.
 */
export async function setChapterCompleted(
  db: AppDrizzleDb,
  chapterId: ChapterId,
  completed: boolean,
): Promise<AppResult<void>> {
  const chapter = db
    .select({
      id: chapters.id,
      mangaId: chapters.mangaId,
      providerMappingId: chapters.providerMappingId,
    })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .get();
  if (chapter === undefined) {
    return err(
      createAppError({ code: 'db.read_state.chapter_missing', message: 'Chapter does not exist.' }),
    );
  }

  const pageCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(chapterPages)
      .where(eq(chapterPages.chapterId, chapterId))
      .get()?.count ?? 0;
  const existing = await getChapterReadState(db, chapterId);
  const now = new Date().toISOString();
  // The upsert guard only accepts an equal-timestamp write when completion or
  // progress moves forward, so marking a chapter unread in the same millisecond
  // as marking it read would be dropped. An explicit action must always win.
  const existingStamp = existing?.progress.updatedAt;
  const existingMs = existingStamp === undefined ? Number.NaN : Date.parse(existingStamp);
  const updatedAt =
    Number.isFinite(existingMs) && existingMs >= Date.parse(now)
      ? new Date(existingMs + 1).toISOString()
      : now;
  const lastPageIndex = completed ? Math.max(0, pageCount - 1) : 0;

  await upsertChapterReadState(db, {
    chapterId,
    mangaId: toMangaId(chapter.mangaId),
    providerMappingId: toProviderMappingId(chapter.providerMappingId),
    progress: {
      completed,
      lastPageIndex,
      readPercent: completed ? 100 : 0,
      startedAt: existing?.progress.startedAt ?? now,
      updatedAt,
    },
  });

  await refreshLibraryUnreadCount(
    db,
    toMangaId(chapter.mangaId),
    toProviderMappingId(chapter.providerMappingId),
  );
  return ok(undefined);
}

/** Marks every earlier chapter of the same provider mapping read in one pass. */
export async function markPreviousChaptersCompleted(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<AppResult<{ readonly updated: number }>> {
  const chapter = db
    .select({
      mangaId: chapters.mangaId,
      providerMappingId: chapters.providerMappingId,
      chapterIndex: chapters.chapterIndex,
    })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .get();
  if (chapter === undefined) {
    return err(
      createAppError({ code: 'db.read_state.chapter_missing', message: 'Chapter does not exist.' }),
    );
  }

  const previous = db
    .select({ id: chapters.id, providerMappingId: chapters.providerMappingId })
    .from(chapters)
    .where(
      and(
        eq(chapters.mangaId, chapter.mangaId),
        lt(chapters.chapterIndex, chapter.chapterIndex),
        eq(chapters.providerMappingId, chapter.providerMappingId),
      ),
    )
    .all();
  if (previous.length > 0) {
    const ids = previous.map((row) => row.id);
    const pageCounts = new Map(
      db
        .select({ chapterId: chapterPages.chapterId, count: sql<number>`count(*)` })
        .from(chapterPages)
        .where(inArray(chapterPages.chapterId, ids))
        .groupBy(chapterPages.chapterId)
        .all()
        .map((row) => [row.chapterId, row.count]),
    );
    const existing = new Map(
      db
        .select({ chapterId: chapterReadState.chapterId, startedAt: chapterReadState.startedAt })
        .from(chapterReadState)
        .where(inArray(chapterReadState.chapterId, ids))
        .all()
        .map((row) => [row.chapterId, row.startedAt]),
    );
    const now = new Date().toISOString();

    for (const row of previous) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- one row per chapter against the browser-SQLite runtime; parallel writes would contend for the same write lock
      await upsertChapterReadState(db, {
        chapterId: toChapterId(row.id),
        mangaId: toMangaId(chapter.mangaId),
        providerMappingId: toProviderMappingId(row.providerMappingId),
        progress: {
          completed: true,
          lastPageIndex: Math.max(0, (pageCounts.get(row.id) ?? 0) - 1),
          readPercent: 100,
          startedAt: existing.get(row.id) || now,
          updatedAt: now,
        },
      });
    }
  }

  await refreshLibraryUnreadCount(
    db,
    toMangaId(chapter.mangaId),
    toProviderMappingId(chapter.providerMappingId),
  );
  return ok({ updated: previous.length });
}

function mapChapterReadState(row: typeof chapterReadState.$inferSelect): ChapterReadState {
  const progress: ReadingProgress = {
    readPercent: row.readPercent,
    lastPageIndex: row.lastPageIndex,
    completed: row.completed,
    ...(row.startedAt !== null && row.startedAt !== undefined && row.startedAt !== ''
      ? { startedAt: row.startedAt }
      : {}),
    ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== ''
      ? { updatedAt: row.updatedAt }
      : {}),
  };

  return {
    chapterId: toChapterId(row.chapterId),
    mangaId: toMangaId(row.mangaId),
    progress,
    ...(row.providerMappingId !== null &&
    row.providerMappingId !== undefined &&
    row.providerMappingId !== ''
      ? { providerMappingId: toProviderMappingId(row.providerMappingId) }
      : {}),
  };
}

export async function getChapterReadState(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<ChapterReadState | undefined> {
  const row = db
    .select()
    .from(chapterReadState)
    .where(eq(chapterReadState.chapterId, chapterId))
    .get();
  if (row === undefined) return undefined;
  return mapChapterReadState(row);
}

export async function listChapterReadStates(db: AppDrizzleDb): Promise<ChapterReadState[]> {
  return db.select().from(chapterReadState).all().map(mapChapterReadState);
}

/** Read states for a whole title, so the detail chapter list needs one query, not one per row. */
export async function listChapterReadStatesForManga(
  db: AppDrizzleDb,
  mangaId: MangaId,
): Promise<ChapterReadState[]> {
  return db
    .select()
    .from(chapterReadState)
    .where(eq(chapterReadState.mangaId, mangaId))
    .all()
    .map(mapChapterReadState);
}

export async function appendReadingHistory(
  db: AppDrizzleDb,
  input: {
    readonly mangaId: MangaId;
    readonly chapterId: ChapterId;
    readonly providerMappingId?: ProviderMappingId;
  },
): Promise<void> {
  const id = newId();
  const readAt = new Date().toISOString();
  await db.insert(readingHistory).values({
    id,
    mangaId: input.mangaId,
    chapterId: input.chapterId,
    readAt,
    providerMappingId: input.providerMappingId,
  });
}

export async function listRecentReadingHistory(
  db: AppDrizzleDb,
  limit: number,
): Promise<
  { readonly mangaId: MangaId; readonly chapterId: ChapterId; readonly readAt: string }[]
> {
  const rows = db
    .select()
    .from(readingHistory)
    .orderBy(desc(readingHistory.readAt))
    .limit(limit)
    .all();
  return rows.map((r) => ({
    mangaId: toMangaId(r.mangaId),
    chapterId: toChapterId(r.chapterId),
    readAt: r.readAt,
  }));
}

export interface ReadingHistoryEntry {
  readonly id: string;
  readonly mangaId: MangaId;
  readonly chapterId: ChapterId;
  readonly readAt: string;
  readonly providerMappingId?: ProviderMappingId;
}

/** Every reading-history row, newest first: backup export carries the whole list. */
export async function listReadingHistory(db: AppDrizzleDb): Promise<ReadingHistoryEntry[]> {
  return db
    .select()
    .from(readingHistory)
    .orderBy(desc(readingHistory.readAt))
    .all()
    .map((row) => ({
      id: row.id,
      mangaId: toMangaId(row.mangaId),
      chapterId: toChapterId(row.chapterId),
      readAt: row.readAt,
      ...(row.providerMappingId !== null &&
      row.providerMappingId !== undefined &&
      row.providerMappingId !== ''
        ? { providerMappingId: toProviderMappingId(row.providerMappingId) }
        : {}),
    }));
}
