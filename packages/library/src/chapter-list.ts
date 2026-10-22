import type { Chapter, ChapterId, ChapterReadState, ProviderMappingId } from '@app/shared';

export type ChapterSort = 'number' | 'latest' | 'unread';
export type ChapterFilter = 'all' | 'unread' | 'read';

export function readChapterIds(
  readStates: readonly ChapterReadState[] | undefined,
): Set<ChapterId> {
  return new Set(
    (readStates ?? []).filter((state) => state.progress.completed).map((state) => state.chapterId),
  );
}

export function chaptersForMapping(
  chapters: readonly Chapter[],
  mappingId: ProviderMappingId | undefined,
): readonly Chapter[] {
  if (mappingId === undefined) return chapters;
  return chapters.filter((chapter) => chapter.providerMappingId === mappingId);
}

export function countUnreadChapters(
  chapters: readonly Chapter[],
  readIds: ReadonlySet<ChapterId>,
): number {
  return chapters.filter((chapter) => !readIds.has(chapter.id)).length;
}

function chapterTimestamp(chapter: Chapter): string | undefined {
  return chapter.publishedAt ?? chapter.updatedAt ?? chapter.createdAt;
}

function compareNumber(a: Chapter, b: Chapter): number {
  return a.index - b.index || a.id.localeCompare(b.id);
}

/**
 * Sorts a chapter list the way the detail toolbar promises. Missing dates rank
 * last in "latest" either way, and unread-first keeps numeric order inside each band.
 */
export function sortChapters(
  chapters: readonly Chapter[],
  sort: ChapterSort,
  readIds: ReadonlySet<ChapterId>,
): Chapter[] {
  const sorted = [...chapters];
  switch (sort) {
    case 'number':
      return sorted.sort(compareNumber);
    case 'latest':
      return sorted.sort((a, b) => {
        const left = chapterTimestamp(a);
        const right = chapterTimestamp(b);
        if (left === undefined || right === undefined) {
          if (left === right) return compareNumber(a, b);
          return left === undefined ? 1 : -1;
        }
        return right.localeCompare(left) || compareNumber(a, b);
      });
    case 'unread':
      return sorted.sort((a, b) => {
        const left = readIds.has(a.id) ? 1 : 0;
        const right = readIds.has(b.id) ? 1 : 0;
        return left - right || compareNumber(a, b);
      });
  }
}

export function filterChapters(
  chapters: readonly Chapter[],
  filter: ChapterFilter,
  readIds: ReadonlySet<ChapterId>,
): readonly Chapter[] {
  if (filter === 'all') return chapters;
  return chapters.filter((chapter) =>
    filter === 'read' ? readIds.has(chapter.id) : !readIds.has(chapter.id),
  );
}

export function selectChapters(
  chapters: readonly Chapter[],
  input: {
    readonly mappingId: ProviderMappingId | undefined;
    readonly sort: ChapterSort;
    readonly filter: ChapterFilter;
    readonly readIds: ReadonlySet<ChapterId>;
  },
): Chapter[] {
  return sortChapters(
    filterChapters(chaptersForMapping(chapters, input.mappingId), input.filter, input.readIds),
    input.sort,
    input.readIds,
  );
}
