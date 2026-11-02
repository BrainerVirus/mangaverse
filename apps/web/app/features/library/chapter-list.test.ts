// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  toChapterId,
  toMangaId,
  toProviderMappingId,
  type Chapter,
  type ChapterReadState,
  type ProviderMappingId,
} from '@app/shared';
import {
  chaptersForMapping,
  countUnreadChapters,
  readChapterIds,
  selectChapters,
  sortChapters,
} from './chapter-list.js';

const MANGA_ID = toMangaId('manga-1');
const MAPPING_A = toProviderMappingId('map-a');
const MAPPING_B = toProviderMappingId('map-b');

function chapter(
  id: string,
  index: number,
  mappingId: ProviderMappingId,
  publishedAt?: string,
): Chapter {
  return {
    id: toChapterId(id),
    mangaId: MANGA_ID,
    providerMappingId: mappingId,
    title: `Chapter ${index}`,
    index,
    pages: [],
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  };
}

function readState(chapterId: string, completed: boolean): ChapterReadState {
  return {
    chapterId: toChapterId(chapterId),
    mangaId: MANGA_ID,
    progress: { readPercent: completed ? 100 : 20, lastPageIndex: 0, completed },
  };
}

const chapters = [
  chapter('c-3', 3, MAPPING_A, '2024-03-01T00:00:00Z'),
  chapter('c-1', 1, MAPPING_A, '2024-01-01T00:00:00Z'),
  chapter('c-2', 2, MAPPING_B, '2024-02-01T00:00:00Z'),
  chapter('c-4', 4, MAPPING_A),
];

describe('chapter list selection', () => {
  it('filters to the active provider mapping', () => {
    expect(chaptersForMapping(chapters, MAPPING_A).map((item) => item.id)).toEqual([
      toChapterId('c-3'),
      toChapterId('c-1'),
      toChapterId('c-4'),
    ]);
  });

  it('sorts by number and latest date', () => {
    const readIds = new Set([toChapterId('c-2')]);
    expect(sortChapters(chapters, 'number', readIds).map((item) => item.id)).toEqual([
      toChapterId('c-1'),
      toChapterId('c-2'),
      toChapterId('c-3'),
      toChapterId('c-4'),
    ]);
    expect(sortChapters(chapters, 'latest', readIds).map((item) => item.id)).toEqual([
      toChapterId('c-3'),
      toChapterId('c-2'),
      toChapterId('c-1'),
      // A chapter without a publish date ranks last.
      toChapterId('c-4'),
    ]);
  });

  it('sorts unread first and filters read/unread bands', () => {
    const readIds = readChapterIds([readState('c-2', true)]);
    expect(sortChapters(chapters, 'unread', readIds).map((item) => item.id)).toEqual([
      toChapterId('c-1'),
      toChapterId('c-3'),
      toChapterId('c-4'),
      toChapterId('c-2'),
    ]);

    expect(
      selectChapters(chapters, {
        mappingId: MAPPING_A,
        sort: 'number',
        filter: 'unread',
        readIds,
      }).map((item) => item.id),
    ).toEqual([toChapterId('c-1'), toChapterId('c-3'), toChapterId('c-4')]);

    expect(
      selectChapters(chapters, {
        mappingId: MAPPING_A,
        sort: 'number',
        filter: 'read',
        readIds,
      }),
    ).toEqual([]);
  });

  it('counts unread chapters inside the given list', () => {
    const readIds = readChapterIds([readState('c-2', true), readState('c-3', false)]);
    expect(countUnreadChapters(chaptersForMapping(chapters, MAPPING_A), readIds)).toBe(3);
    expect(countUnreadChapters(chaptersForMapping(chapters, MAPPING_B), readIds)).toBe(0);
  });
});
