import { describe, expect, it } from 'vitest';

import { createOpenChapterRegistry } from './open-chapters.js';

const CHAPTER_1 = {
  providerId: 'mangadex',
  mangaId: 'manga-1',
  chapterId: 'chapter-1',
};
const CHAPTER_2 = {
  providerId: 'mangadex',
  mangaId: 'manga-1',
  chapterId: 'chapter-2',
};

describe('open chapter registry', () => {
  // The probe collects live replies, so a generous window keeps this test about
  // the protocol rather than about scheduler latency. Keep it under the default
  // 5 s test timeout.
  const createRegistry = () => createOpenChapterRegistry({ probeTimeoutMs: 500 });

  it('Given two live registries, When one asks, Then the other open chapter is reported', async () => {
    const tabA = createRegistry();
    const tabB = createRegistry();

    tabA.setOpenChapter(CHAPTER_1);
    expect(await tabB.listOpenChapters()).toEqual([CHAPTER_1]);

    tabA.setOpenChapter(undefined);
    expect(await tabB.listOpenChapters()).toEqual([]);
  });

  it('Given two registries reading, When either asks, Then both chapters are reported once', async () => {
    const tabA = createRegistry();
    const tabB = createRegistry();

    tabA.setOpenChapter(CHAPTER_1);
    tabB.setOpenChapter(CHAPTER_2);

    try {
      expect(await tabA.listOpenChapters()).toEqual([CHAPTER_1, CHAPTER_2]);
    } finally {
      tabA.setOpenChapter(undefined);
      tabB.setOpenChapter(undefined);
    }
  });
});
