import type { AppDrizzleDb } from '@app/db/browser';
import type { MangaDetailData } from '@app/library';
import { upsertChapterWithPages, upsertMangaIdentity, getMangaIdentity } from '@app/db/browser';
import type { Chapter, ChapterPage } from '@app/shared';
import { toChapterPageId } from '@app/shared';

export async function persistDevMangaDetailToDb(
  db: AppDrizzleDb,
  detail: MangaDetailData,
): Promise<void> {
  await upsertMangaIdentity(db, detail.manga);

  const mappingId = detail.manga.defaultProviderMappingId;
  const providerId = detail.manga.providerMappings.find((mapping) => mapping.id === mappingId)?.providerId;

  await Promise.all(
    detail.chapters.map(async (chapter) => {
      const result = await upsertChapterWithPages(db, {
        chapterId: chapter.id,
        mangaId: chapter.mangaId,
        providerMappingId: mappingId,
        ...(providerId !== undefined ? { providerId: String(providerId) } : {}),
        ...(chapter.providerChapterId !== undefined ? { providerChapterId: chapter.providerChapterId } : {}),
        title: chapter.title,
        index: chapter.index,
        ...(chapter.volume !== undefined ? { volume: chapter.volume } : {}),
        ...(chapter.publishedAt !== undefined ? { publishedAt: chapter.publishedAt } : {}),
        pages: [...chapter.pages],
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
    }),
  );
}

export async function persistDevChapterPagesToDb(
  db: AppDrizzleDb,
  chapter: Chapter,
  pages: readonly ChapterPage[],
): Promise<void> {
  const manga = await getMangaIdentity(db, chapter.mangaId);
  if (manga === undefined) {
    return;
  }

  const result = await upsertChapterWithPages(db, {
    chapterId: chapter.id,
    mangaId: chapter.mangaId,
    providerMappingId: manga.defaultProviderMappingId,
    ...(chapter.providerId !== undefined ? { providerId: String(chapter.providerId) } : {}),
    ...(chapter.providerChapterId !== undefined ? { providerChapterId: chapter.providerChapterId } : {}),
    title: chapter.title,
    index: chapter.index,
    ...(chapter.volume !== undefined ? { volume: chapter.volume } : {}),
    ...(chapter.publishedAt !== undefined ? { publishedAt: chapter.publishedAt } : {}),
    pages: pages.map((page) => ({
      ...page,
      id: page.id ?? toChapterPageId(crypto.randomUUID()),
    })),
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }
}

export function mergeMangaDetailWithLibrary(
  detail: MangaDetailData,
  local: MangaDetailData | null,
): MangaDetailData {
  if (local === null) {
    return detail;
  }

  return {
    ...detail,
    libraryEntry: local.libraryEntry,
    continueChapterId: local.continueChapterId ?? detail.continueChapterId,
  };
}

export function shouldRefreshDevMangaDetail(local: MangaDetailData | null): boolean {
  if (local === null) {
    return true;
  }
  return local.chapters.length === 0;
}
