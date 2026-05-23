import type { Chapter } from '@app/shared';
import type { ReaderChapter, ReaderPage } from './types.js';

export function mapChapterToReaderChapter(chapter: Chapter): ReaderChapter {
  const pages: ReaderPage[] = chapter.pages.map((page) => ({
    id: page.id,
    index: page.index,
    image: page.image,
    ...(page.image.width !== undefined ? { width: page.image.width } : {}),
    ...(page.image.height !== undefined ? { height: page.image.height } : {}),
    ...(page.image.bytes !== undefined ? { bytes: page.image.bytes } : {}),
    ...(page.loadFailed !== undefined ? { loadFailed: page.loadFailed } : {}),
    ...(page.retryCount !== undefined ? { retryCount: page.retryCount } : {}),
    ...(page.lastErrorCode !== undefined ? { lastErrorCode: page.lastErrorCode } : {}),
  }));

  return {
    id: chapter.id,
    mangaId: chapter.mangaId,
    title: chapter.title,
    pages,
    pageCount: pages.length,
  };
}
