import type { ChapterId } from '@app/shared';

export const readerQueryKeys = {
  all: ['reader'] as const,
  chapter: (chapterId: ChapterId) => [...readerQueryKeys.all, 'chapter', chapterId] as const,
};
