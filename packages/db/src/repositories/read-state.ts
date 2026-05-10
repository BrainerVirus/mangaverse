import { desc, eq } from 'drizzle-orm';
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
import { chapterReadState, chapters, readingHistory } from '../schema.js';

function newId(): string {
  return crypto.randomUUID();
}

export async function upsertChapterReadState(
  db: AppDrizzleDb,
  input: ChapterReadState,
): Promise<AppResult<void>> {
  const chapter = await db
    .select({ id: chapters.id, mangaId: chapters.mangaId })
    .from(chapters)
    .where(eq(chapters.id, input.chapterId))
    .get();
  if (chapter === undefined) {
    return err(createAppError({ code: 'db.read_state.chapter_missing', message: 'Chapter does not exist.' }));
  }
  if (chapter.mangaId !== input.mangaId) {
    return err(createAppError({ code: 'db.read_state.manga_chapter_mismatch', message: 'Chapter does not belong to the given manga.' }));
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

export async function getChapterReadState(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<ChapterReadState | undefined> {
  const row = await db.select().from(chapterReadState).where(eq(chapterReadState.chapterId, chapterId)).get();
  if (row === undefined) return undefined;

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
    ...(row.providerMappingId !== null && row.providerMappingId !== undefined && row.providerMappingId !== ''
      ? { providerMappingId: toProviderMappingId(row.providerMappingId) }
      : {}),
  };
}

export async function appendReadingHistory(
  db: AppDrizzleDb,
  input: { readonly mangaId: MangaId; readonly chapterId: ChapterId; readonly providerMappingId?: ProviderMappingId },
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
): Promise<{ readonly mangaId: MangaId; readonly chapterId: ChapterId; readonly readAt: string }[]> {
  const rows = await db
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
