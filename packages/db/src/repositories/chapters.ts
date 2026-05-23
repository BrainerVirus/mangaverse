import { and, eq } from 'drizzle-orm';
import type { AppResult } from '@app/shared';
import {
  createAppError,
  err,
  ok,
  toChapterId,
  toChapterPageId,
  toMangaId,
  toProviderId,
  type Chapter,
  type ChapterPage,
  type ChapterId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import type { AppDrizzleDb } from '../adapter.js';
import { chapterPages, chapters, mangaProviderMappings } from '../schema.js';

function newId(): string {
  return crypto.randomUUID();
}

export async function upsertChapterWithPages(
  db: AppDrizzleDb,
  input: {
    readonly chapterId?: ChapterId;
    readonly mangaId: MangaId;
    readonly providerMappingId: ProviderMappingId;
    readonly providerId?: string;
    readonly providerChapterId?: string;
    readonly title: string;
    readonly index: number;
    readonly volume?: string;
    readonly publishedAt?: string;
    readonly pages: readonly ChapterPage[];
  },
): Promise<AppResult<ChapterId>> {
  const mapping = await db
    .select({ id: mangaProviderMappings.id, mangaId: mangaProviderMappings.mangaId })
    .from(mangaProviderMappings)
    .where(eq(mangaProviderMappings.id, input.providerMappingId))
    .get();
  if (mapping === undefined) {
    return err(createAppError({ code: 'db.chapters.mapping_missing', message: 'Provider mapping not found.' }));
  }
  if (mapping.mangaId !== input.mangaId) {
    return err(createAppError({ code: 'db.chapters.mapping_wrong_manga', message: 'Provider mapping does not belong to this manga.' }));
  }

  const chapterId = input.chapterId ?? toChapterId(newId());
  const now = new Date().toISOString();

  const existing = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.providerMappingId, input.providerMappingId), eq(chapters.chapterIndex, input.index)))
    .get();

  if (existing === undefined) {
    await db.insert(chapters).values({
      id: chapterId,
      mangaId: input.mangaId,
      providerMappingId: input.providerMappingId,
      providerId: input.providerId,
      providerChapterId: input.providerChapterId,
      title: input.title,
      chapterIndex: input.index,
      volume: input.volume,
      publishedAt: input.publishedAt,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(chapters)
      .set({
        title: input.title,
        providerId: input.providerId,
        providerChapterId: input.providerChapterId,
        volume: input.volume,
        publishedAt: input.publishedAt,
        updatedAt: now,
      })
      .where(eq(chapters.id, existing.id));
  }

  const resolvedId =
    existing === undefined ? chapterId : toChapterId(existing.id);

  await db.delete(chapterPages).where(eq(chapterPages.chapterId, resolvedId));
  if (input.pages.length > 0) {
    await db.insert(chapterPages).values(
      input.pages.map((p) => ({
        id: p.id,
        chapterId: resolvedId,
        pageIndex: p.index,
        imageUrl: p.image.url,
        width: p.image.width,
        height: p.image.height,
        bytes: p.image.bytes,
        mimeType: p.image.mimeType,
        loadFailed: p.loadFailed,
        retryCount: p.retryCount,
        lastErrorCode: p.lastErrorCode,
      })),
    );
  }

  return ok(resolvedId);
}

export async function getChapter(db: AppDrizzleDb, chapterId: ChapterId): Promise<Chapter | undefined> {
  const row = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
  if (row === undefined) return undefined;

  const pages = await db.select().from(chapterPages).where(eq(chapterPages.chapterId, chapterId)).all();
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);

  const chapterPagesOut: ChapterPage[] = sorted.map((p) => ({
    id: toChapterPageId(p.id),
    index: p.pageIndex,
    image: {
      url: p.imageUrl,
      ...(p.width !== null && p.width !== undefined ? { width: p.width } : {}),
      ...(p.height !== null && p.height !== undefined ? { height: p.height } : {}),
      ...(p.bytes !== null && p.bytes !== undefined ? { bytes: p.bytes } : {}),
      ...(p.mimeType !== null && p.mimeType !== undefined && p.mimeType !== '' ? { mimeType: p.mimeType } : {}),
    },
    ...(p.loadFailed !== null && p.loadFailed !== undefined ? { loadFailed: p.loadFailed } : {}),
    ...(p.retryCount !== null && p.retryCount !== undefined ? { retryCount: p.retryCount } : {}),
    ...(p.lastErrorCode !== null && p.lastErrorCode !== undefined && p.lastErrorCode !== ''
      ? { lastErrorCode: p.lastErrorCode }
      : {}),
  }));

  const chapter: Chapter = {
    id: toChapterId(row.id),
    mangaId: toMangaId(row.mangaId),
    title: row.title,
    index: row.chapterIndex,
    pages: chapterPagesOut,
    ...(row.providerId !== null && row.providerId !== undefined && row.providerId !== ''
      ? { providerId: toProviderId(row.providerId) }
      : {}),
    ...(row.providerChapterId !== null && row.providerChapterId !== undefined && row.providerChapterId !== ''
      ? { providerChapterId: row.providerChapterId }
      : {}),
    ...(row.volume !== null && row.volume !== undefined && row.volume !== '' ? { volume: row.volume } : {}),
    ...(row.publishedAt !== null && row.publishedAt !== undefined && row.publishedAt !== ''
      ? { publishedAt: row.publishedAt }
      : {}),
    ...(row.createdAt !== null && row.createdAt !== undefined && row.createdAt !== '' ? { createdAt: row.createdAt } : {}),
    ...(row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt !== '' ? { updatedAt: row.updatedAt } : {}),
  };

  return chapter;
}

export async function listChaptersForManga(db: AppDrizzleDb, mangaId: MangaId): Promise<Chapter[]> {
  const rows = await db.select().from(chapters).where(eq(chapters.mangaId, mangaId)).all();
  const sorted = [...rows].sort((a, b) => a.chapterIndex - b.chapterIndex);
  const loaded = await Promise.all(sorted.map((row) => getChapter(db, toChapterId(row.id))));
  return loaded.filter((c): c is Chapter => c !== undefined);
}
