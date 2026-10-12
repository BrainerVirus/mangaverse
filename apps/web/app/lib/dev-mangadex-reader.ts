import type { AppDrizzleDb } from '@app/db/browser';
import type { ChapterId, ChapterPage } from '@app/shared';
import { toChapterPageId } from '@app/shared';
import { parseDevMangaDexChapterId } from './dev-mangadex-search.js';
import { persistDevChapterPagesToDb } from './dev-mangadex-persist.js';

const MANGADEX_API = 'https://api.mangadex.org';

interface MangaDexAtHomeResponse {
  readonly baseUrl?: string;
  readonly chapter?: {
    readonly hash?: string;
    readonly data?: readonly string[];
    readonly dataSaver?: readonly string[];
  };
}

export async function fetchDevMangaDexChapterPages(
  chapterId: ChapterId,
  quality: 'data' | 'data-saver' = 'data-saver',
): Promise<readonly ChapterPage[]> {
  const mangadexChapterId = parseDevMangaDexChapterId(chapterId);
  if (mangadexChapterId === null) {
    return [];
  }

  const response = await fetch(`${MANGADEX_API}/at-home/server/${mangadexChapterId}`);
  if (!response.ok) {
    throw new Error(`MangaDex at-home request failed (${response.status})`);
  }

  const payload = (await response.json()) as MangaDexAtHomeResponse;
  const baseUrl = payload.baseUrl;
  const hash = payload.chapter?.hash;
  const filenames =
    quality === 'data' ? payload.chapter?.data : (payload.chapter?.dataSaver ?? payload.chapter?.data);

  if (baseUrl === undefined || hash === undefined || filenames === undefined || filenames.length === 0) {
    return [];
  }

  return filenames.map((filename, index) => ({
    id: toChapterPageId(`dev-md-page-${mangadexChapterId}-${index}`),
    index,
    image: {
      url: `${baseUrl}/${quality}/${hash}/${filename}`,
    },
  }));
}

export async function hydrateDevReaderChapterIfNeeded(
  db: AppDrizzleDb,
  chapterId: ChapterId,
): Promise<void> {
  const mangadexChapterId = parseDevMangaDexChapterId(chapterId);
  if (mangadexChapterId === null) {
    return;
  }

  const { getChapter } = await import('@app/db/browser');
  const chapter = await getChapter(db, chapterId);
  if (chapter === undefined || chapter.pages.length > 0) {
    return;
  }

  const pages = await fetchDevMangaDexChapterPages(chapterId);
  if (pages.length === 0) {
    return;
  }

  await persistDevChapterPagesToDb(db, chapter, pages);
}
