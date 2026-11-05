import { describe, it, expect } from 'vitest';
import { getDefaultReaderSettings, toChapterPageId, type SpreadOffset } from '@app/shared';
import { calculatePageSlots, calculateSpreadPlan, resolveInitialPageIndex } from './spreads';
import { createReaderState } from './state';
import { toReaderEngineSettings } from './to-reader-engine-settings';
import type { ReaderChapter, ReaderEngineSettings, ReaderPage, ReaderSessionInput } from './types';

const mockPages: ReaderPage[] = [
  { id: toChapterPageId('p1'), index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: toChapterPageId('p2'), index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: toChapterPageId('p3'), index: 2, image: { url: 'http://example.com/3.jpg' } },
  { id: toChapterPageId('p4'), index: 3, image: { url: 'http://example.com/4.jpg' } },
  { id: toChapterPageId('p5'), index: 4, image: { url: 'http://example.com/5.jpg' } },
  { id: toChapterPageId('p6'), index: 5, image: { url: 'http://example.com/6.jpg' } },
];

const mockChapter: ReaderChapter = {
  id: 'ch1',
  mangaId: 'm1',
  title: 'Chapter 1',
  pages: mockPages,
  pageCount: 6,
};

const mockViewport = { width: 1200, height: 800, orientation: 'landscape' as const };

const defaultSettings: ReaderEngineSettings = {
  readingMode: 'ltr',
  pageLayout: 'single',
  tapZoneLayout: 'leftRight',
  fitMode: 'width',
  navigationDirection: 'default',
  tapZoneDebugOverlay: false,
  minZoom: 1,
  maxZoom: 3,
  doubleTapZoom: 1.5,
  gestureSensitivity: 1,
  treatFirstPageAsCover: false,
  preloadAhead: 2,
  lowMemoryMode: false,
  wheelBehavior: 'scroll',
  verticalGapPx: 0,
};

function makeInput(
  settings: Partial<ReaderEngineSettings> = {},
  chapter: ReaderChapter = mockChapter,
): ReaderSessionInput {
  return {
    chapter,
    viewport: mockViewport,
    settings: { ...defaultSettings, ...settings },
  };
}

describe('calculatePageSlots', () => {
  it('should return single slot per page for single layout', () => {
    const input = makeInput({ pageLayout: 'single' });
    const slots = calculatePageSlots(input);

    expect(slots).toHaveLength(6);
    expect(slots[0]!.pageIndex).toBe(0);
    expect(slots[0]!.isCover).toBe(false);
  });

  it('should pair pages for double layout in LTR', () => {
    const input = makeInput({ pageLayout: 'double', readingMode: 'ltr' });
    const slots = calculatePageSlots(input);

    // Double layout pairs mechanically - even pages are left, odd are right
    expect(slots[0]!.pageIndex).toBe(0);
    expect(slots[0]!.isLeftPage).toBe(true);
    expect(slots[0]!.isRightPage).toBe(false);
    expect(slots[1]!.pageIndex).toBe(1);
    expect(slots[1]!.isLeftPage).toBe(false);
    expect(slots[1]!.isRightPage).toBe(true);
  });

  it('should pair pages mechanically for double layout without dimensions', () => {
    const noDimPages = [
      { id: toChapterPageId('p1'), index: 0, image: { url: 'http://example.com/1.jpg' } },
      { id: toChapterPageId('p2'), index: 1, image: { url: 'http://example.com/2.jpg' } },
      { id: toChapterPageId('p3'), index: 2, image: { url: 'http://example.com/3.jpg' } },
      { id: toChapterPageId('p4'), index: 3, image: { url: 'http://example.com/4.jpg' } },
    ];
    const noDimChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'No Dimensions',
      pages: noDimPages,
      pageCount: 4,
    };
    const input = makeInput({ pageLayout: 'double' }, noDimChapter);

    const slots = calculatePageSlots(input);

    // Double layout should pair mechanically regardless of dimensions
    expect(slots[0]!.pageIndex).toBe(0);
    expect(slots[0]!.isLeftPage).toBe(true);
    expect(slots[1]!.pageIndex).toBe(1);
    expect(slots[1]!.isRightPage).toBe(true);
    expect(slots[2]!.pageIndex).toBe(2);
    expect(slots[2]!.isLeftPage).toBe(true);
    expect(slots[3]!.pageIndex).toBe(3);
    expect(slots[3]!.isRightPage).toBe(true);
  });

  it('should leave cover page alone when treatFirstPageAsCover is true', () => {
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: true });
    const slots = calculatePageSlots(input);

    expect(slots[0]!.pageIndex).toBe(0);
    expect(slots[0]!.isCover).toBe(true);
  });

  it('should correctly pair pages for double layout with treatFirstPageAsCover', () => {
    const fivePageChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Chapter 1',
      pages: [
        { id: toChapterPageId('p1'), index: 0, image: { url: 'http://example.com/1.jpg' } },
        { id: toChapterPageId('p2'), index: 1, image: { url: 'http://example.com/2.jpg' } },
        { id: toChapterPageId('p3'), index: 2, image: { url: 'http://example.com/3.jpg' } },
        { id: toChapterPageId('p4'), index: 3, image: { url: 'http://example.com/4.jpg' } },
        { id: toChapterPageId('p5'), index: 4, image: { url: 'http://example.com/5.jpg' } },
      ],
      pageCount: 5,
    };
    const input = makeInput({ pageLayout: 'double', treatFirstPageAsCover: true }, fivePageChapter);

    const slots = calculatePageSlots(input);

    expect(slots[0]!.pageIndex).toBe(0);
    expect(slots[0]!.isCover).toBe(true);
    expect(slots[1]!.pageIndex).toBe(1);
    expect(slots[1]!.isLeftPage).toBe(true);
    expect(slots[2]!.pageIndex).toBe(2);
    expect(slots[2]!.isRightPage).toBe(true);
    expect(slots[3]!.pageIndex).toBe(3);
    expect(slots[3]!.isLeftPage).toBe(true);
    expect(slots[4]!.pageIndex).toBe(4);
    expect(slots[4]!.isRightPage).toBe(true);
  });

  it('should handle odd page count in double layout', () => {
    const oddChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Chapter 1',
      pages: mockPages.slice(0, 5),
      pageCount: 5,
    };
    const input = makeInput({ pageLayout: 'double' }, oddChapter);

    const slots = calculatePageSlots(input);

    expect(slots.at(-1)!.pageIndex).toBe(4);
  });

  it('should skip spread pairing for vertical mode', () => {
    const input = makeInput({ readingMode: 'vertical', pageLayout: 'double' });
    const slots = calculatePageSlots(input);

    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      expect(slot.isLeftPage).toBe(false);
      expect(slot.isRightPage).toBe(false);
    }
  });

  it('should pair portrait pages in smartSpread', () => {
    const portraitPages = [
      {
        id: toChapterPageId('p1'),
        index: 0,
        image: { url: 'http://example.com/1.jpg', width: 600, height: 1000 },
      },
      {
        id: toChapterPageId('p2'),
        index: 1,
        image: { url: 'http://example.com/2.jpg', width: 600, height: 1000 },
      },
      {
        id: toChapterPageId('p3'),
        index: 2,
        image: { url: 'http://example.com/3.jpg', width: 600, height: 1000 },
      },
    ];
    const portraitChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Portrait Chapter',
      pages: portraitPages,
      pageCount: 3,
    };
    const input = makeInput({ pageLayout: 'smartSpread' }, portraitChapter);

    const slots = calculatePageSlots(input);

    // Both pages are portrait (height > width), so they should pair
    expect(slots[0]!.pageIndex).toBe(0);
    expect(slots[0]!.isLeftPage).toBe(true);
    expect(slots[0]!.isRightPage).toBe(false);
    expect(slots[1]!.pageIndex).toBe(1);
    expect(slots[1]!.isLeftPage).toBe(false);
    expect(slots[1]!.isRightPage).toBe(true);
  });

  it('should keep landscape pages standalone in smartSpread', () => {
    const landscapePages = [
      {
        id: toChapterPageId('p1'),
        index: 0,
        image: { url: 'http://example.com/1.jpg', width: 1600, height: 900 },
      },
      {
        id: toChapterPageId('p2'),
        index: 1,
        image: { url: 'http://example.com/2.jpg', width: 1600, height: 900 },
      },
      {
        id: toChapterPageId('p3'),
        index: 2,
        image: { url: 'http://example.com/3.jpg', width: 1600, height: 900 },
      },
    ];
    const landscapeChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Landscape Chapter',
      pages: landscapePages,
      pageCount: 3,
    };
    const input = makeInput({ pageLayout: 'smartSpread' }, landscapeChapter);

    const slots = calculatePageSlots(input);

    // Landscape pages (width > height) should stand alone
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.isLeftPage).toBe(false);
      expect(slot.isRightPage).toBe(false);
    }
  });

  it('should keep pages with missing dimensions standalone in smartSpread', () => {
    const mixedPages = [
      { id: toChapterPageId('p1'), index: 0, image: { url: 'http://example.com/1.jpg' } },
      {
        id: toChapterPageId('p2'),
        index: 1,
        image: { url: 'http://example.com/2.jpg', width: 600, height: 1000 },
      },
    ];
    const mixedChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Mixed Chapter',
      pages: mixedPages,
      pageCount: 2,
    };
    const input = makeInput({ pageLayout: 'smartSpread' }, mixedChapter);

    const slots = calculatePageSlots(input);

    // Missing dimensions = can't pair, so standalone
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot.isLeftPage).toBe(false);
      expect(slot.isRightPage).toBe(false);
    }
  });

  it('should pair first cover with second page in smartSpread when cover is portrait', () => {
    const coverAndPortrait = [
      {
        id: toChapterPageId('p1'),
        index: 0,
        image: { url: 'http://example.com/1.jpg', width: 600, height: 1000 },
      },
      {
        id: toChapterPageId('p2'),
        index: 1,
        image: { url: 'http://example.com/2.jpg', width: 600, height: 1000 },
      },
    ];
    const coverChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Cover Portrait',
      pages: coverAndPortrait,
      pageCount: 2,
    };
    const input = makeInput(
      { pageLayout: 'smartSpread', treatFirstPageAsCover: false },
      coverChapter,
    );

    const slots = calculatePageSlots(input);

    // Both are portrait, so they pair
    expect(slots[0]!.isLeftPage).toBe(true);
    expect(slots[1]!.isRightPage).toBe(true);
  });
});

describe('spread offset', () => {
  const portraitChapter: ReaderChapter = {
    ...mockChapter,
    pages: mockPages.map((page) => ({
      ...page,
      image: { ...page.image, width: 600, height: 1000 },
    })),
  };

  /** Every spread the reader shows, in page order, as the on-screen left-to-right indexes. */
  function spreadsShown(
    spreadOffset: SpreadOffset,
    pageLayout: 'double' | 'smartSpread',
    readingMode: 'ltr' | 'rtl',
  ): readonly string[] {
    const settings = toReaderEngineSettings({
      ...getDefaultReaderSettings(),
      spreadOffset,
      pageLayout,
      readingMode,
    });
    const shown = portraitChapter.pages.map((_page, pageIndex) =>
      createReaderState({
        chapter: portraitChapter,
        viewport: mockViewport,
        settings,
        initialPageIndex: pageIndex,
      }).visiblePageIndexes.join(','),
    );
    return [...new Set(shown)];
  }

  it.each([
    ['double', 'ltr', ['0', '1,2', '3,4', '5']],
    ['double', 'rtl', ['0', '2,1', '4,3', '5']],
    ['smartSpread', 'ltr', ['0', '1,2', '3,4', '5']],
    ['smartSpread', 'rtl', ['0', '2,1', '4,3', '5']],
  ] as const)(
    'Given cover alone in %s %s, When the chapter is paged through, Then the first page shows alone',
    (pageLayout, readingMode, expected) => {
      expect(spreadsShown(0, pageLayout, readingMode)).toEqual(expected);
    },
  );

  it.each([
    ['double', 'ltr', ['0,1', '2,3', '4,5']],
    ['double', 'rtl', ['1,0', '3,2', '5,4']],
    ['smartSpread', 'ltr', ['0,1', '2,3', '4,5']],
    ['smartSpread', 'rtl', ['1,0', '3,2', '5,4']],
  ] as const)(
    'Given offset by one in %s %s, When the chapter is paged through, Then pairs start at the first page',
    (pageLayout, readingMode, expected) => {
      expect(spreadsShown(1, pageLayout, readingMode)).toEqual(expected);
    },
  );
});

describe('calculateSpreadPlan', () => {
  it('should create spread plan for double layout', () => {
    const input = makeInput({ pageLayout: 'double' });
    const plan = calculateSpreadPlan(input);

    expect(plan.slots).toBeDefined();
    expect(plan.slotCount).toBeGreaterThan(0);
    expect(plan.pageIndexes).toBeDefined();
  });

  it('should create spread plan for smartSpread with cover', () => {
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: true });
    const plan = calculateSpreadPlan(input);

    const firstSpread = plan.slots.filter((s) => s.isCover);
    expect(firstSpread.length).toBeGreaterThan(0);
  });
});

describe('resolveInitialPageIndex', () => {
  it('should return 0 when no bookmark', () => {
    const input = makeInput();
    const index = resolveInitialPageIndex(input, undefined);

    expect(index).toBe(0);
  });

  it('should return bookmarked page', () => {
    const input = makeInput();
    const index = resolveInitialPageIndex(input, 3);

    expect(index).toBe(3);
  });

  it('should clamp bookmark to valid range', () => {
    const input = makeInput();
    const index = resolveInitialPageIndex(input, 99);

    expect(index).toBe(5);
  });

  it('should prefer cover page as initial for cover-aware layout', () => {
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: true });
    const index = resolveInitialPageIndex(input, undefined);

    expect(index).toBeGreaterThanOrEqual(1);
  });
});
