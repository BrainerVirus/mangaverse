import type { ChapterId, ChapterPageId, MangaId } from '@app/shared';
import { toChapterId, toChapterPageId, toMangaId } from '@app/shared';

/**
 * App-side id conventions for MangaDex-sourced records. These keep the
 * historical `dev-md-` prefixes: existing local databases already store library
 * entries, progress and chapter ids under them, and the reader journey must not
 * duplicate or orphan that data. They are stable app ids, not dev-only ids.
 */
const MANGA_PREFIX = 'dev-md-';
const CHAPTER_PREFIX = 'dev-md-ch-';
const PAGE_PREFIX = 'dev-md-page-';

export function toMangadexAppMangaId(mangadexMangaId: string): MangaId {
  return toMangaId(`${MANGA_PREFIX}${mangadexMangaId}`);
}

export function parseMangadexAppMangaId(mangaId: MangaId): string | null {
  const raw = String(mangaId);
  return raw.startsWith(MANGA_PREFIX) ? raw.slice(MANGA_PREFIX.length) : null;
}

export function toMangadexAppChapterId(mangadexChapterId: string): ChapterId {
  return toChapterId(`${CHAPTER_PREFIX}${mangadexChapterId}`);
}

export function parseMangadexAppChapterId(chapterId: ChapterId): string | null {
  const raw = String(chapterId);
  return raw.startsWith(CHAPTER_PREFIX) ? raw.slice(CHAPTER_PREFIX.length) : null;
}

export function isMangadexAppMangaId(mangaId: MangaId): boolean {
  return parseMangadexAppMangaId(mangaId) !== null;
}

/** Page ids stay deterministic so a reloaded chapter reuses the same rows. */
export function toMangadexChapterPageId(mangadexChapterId: string, index: number): ChapterPageId {
  return toChapterPageId(`${PAGE_PREFIX}${mangadexChapterId}-${index}`);
}
