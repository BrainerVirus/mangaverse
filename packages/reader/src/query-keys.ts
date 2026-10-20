import type { ChapterId } from '@app/shared';

export const readerQueryKeys = {
  all: ['reader'] as const,
  chapter: (chapterId: ChapterId) => [...readerQueryKeys.all, 'chapter', chapterId] as const,
  /** Provider page hydration for a locally empty chapter; never part of the local read. */
  chapterHydration: (chapterId: ChapterId) =>
    [...readerQueryKeys.all, 'chapter-hydration', chapterId] as const,
};
