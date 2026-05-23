import { describe, it, expect } from 'vitest';
import {
  calculatePageSlots,
  calculateSpreadPlan,
  resolveInitialPageIndex,
} from './spreads';
import type { ReaderSessionInput } from './types';

const mockPages = [
  { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
  { id: 'p4', index: 3, image: { url: 'http://example.com/4.jpg' } },
  { id: 'p5', index: 4, image: { url: 'http://example.com/5.jpg' } },
  { id: 'p6', index: 5, image: { url: 'http://example.com/6.jpg' } },
];

const mockChapter = {
  id: 'ch1',
  mangaId: 'm1',
  title: 'Chapter 1',
  pages: mockPages,
  pageCount: 6,
};

const mockViewport = { width: 1200, height: 800, orientation: 'landscape' as const };

const defaultSettings = {
  readingMode: 'ltr' as const,
  pageLayout: 'single' as const,
  tapZoneLayout: 'leftRight' as const,
  navigationDirection: 'default' as const,
  tapZoneDebugOverlay: false,
  minZoom: 1,
  maxZoom: 3,
  doubleTapZoom: 1.5,
  gestureSensitivity: 1,
  treatFirstPageAsCover: false,
  preloadAhead: 2,
  lowMemoryMode: false,
};

function makeInput(settings: Partial<typeof defaultSettings> = {}): ReaderSessionInput {
  return {
    chapter: mockChapter as any,
    viewport: mockViewport,
    settings: { ...defaultSettings, ...settings },
  };
}

describe('calculatePageSlots', () => {
  it('should return single slot per page for single layout', () => {
    const input = makeInput({ pageLayout: 'single' });
    const slots = calculatePageSlots(input);

    expect(slots).toHaveLength(6);
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isCover).toBe(false);
  });

  it('should pair pages for double layout in LTR', () => {
    const input = makeInput({ pageLayout: 'double', readingMode: 'ltr' });
    const slots = calculatePageSlots(input);

    // Double layout pairs mechanically - even pages are left, odd are right
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[0].isRightPage).toBe(false);
    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isLeftPage).toBe(false);
    expect(slots[1].isRightPage).toBe(true);
  });

  it('should pair pages mechanically for double layout without dimensions', () => {
    const noDimPages = [
      { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
      { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
      { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
      { id: 'p4', index: 3, image: { url: 'http://example.com/4.jpg' } },
    ];
    const noDimChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'No Dimensions',
      pages: noDimPages,
      pageCount: 4,
    };
    const input = makeInput({ pageLayout: 'double' });
    input.chapter = noDimChapter as any;

    const slots = calculatePageSlots(input);

    // Double layout should pair mechanically regardless of dimensions
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isRightPage).toBe(true);
    expect(slots[2].pageIndex).toBe(2);
    expect(slots[2].isLeftPage).toBe(true);
    expect(slots[3].pageIndex).toBe(3);
    expect(slots[3].isRightPage).toBe(true);
  });

  it('should leave cover page alone when treatFirstPageAsCover is true', () => {
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: true });
    const slots = calculatePageSlots(input);

    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isCover).toBe(true);
  });

  it('should correctly pair pages for double layout with treatFirstPageAsCover', () => {
    const fivePageChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Chapter 1',
      pages: [
        { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
        { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
        { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
        { id: 'p4', index: 3, image: { url: 'http://example.com/4.jpg' } },
        { id: 'p5', index: 4, image: { url: 'http://example.com/5.jpg' } },
      ],
      pageCount: 5,
    };
    const input = makeInput({ pageLayout: 'double', treatFirstPageAsCover: true });
    input.chapter = fivePageChapter as any;

    const slots = calculatePageSlots(input);

    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isCover).toBe(true);
    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isLeftPage).toBe(true);
    expect(slots[2].pageIndex).toBe(2);
    expect(slots[2].isRightPage).toBe(true);
    expect(slots[3].pageIndex).toBe(3);
    expect(slots[3].isLeftPage).toBe(true);
    expect(slots[4].pageIndex).toBe(4);
    expect(slots[4].isRightPage).toBe(true);
  });

  it('should handle odd page count in double layout', () => {
    const oddChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Chapter 1',
      pages: mockPages.slice(0, 5),
      pageCount: 5,
    };
    const input = makeInput({ pageLayout: 'double' });
    input.chapter = oddChapter as any;

    const slots = calculatePageSlots(input);

    expect(slots[slots.length - 1].pageIndex).toBe(4);
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
      { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg', width: 600, height: 1000 } },
      { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg', width: 600, height: 1000 } },
      { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg', width: 600, height: 1000 } },
    ];
    const portraitChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Portrait Chapter',
      pages: portraitPages,
      pageCount: 3,
    };
    const input = makeInput({ pageLayout: 'smartSpread' });
    input.chapter = portraitChapter as any;

    const slots = calculatePageSlots(input);

    // Both pages are portrait (height > width), so they should pair
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[0].isRightPage).toBe(false);
    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isLeftPage).toBe(false);
    expect(slots[1].isRightPage).toBe(true);
  });

  it('should keep landscape pages standalone in smartSpread', () => {
    const landscapePages = [
      { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg', width: 1600, height: 900 } },
      { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg', width: 1600, height: 900 } },
      { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg', width: 1600, height: 900 } },
    ];
    const landscapeChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Landscape Chapter',
      pages: landscapePages,
      pageCount: 3,
    };
    const input = makeInput({ pageLayout: 'smartSpread' });
    input.chapter = landscapeChapter as any;

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
      { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
      { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg', width: 600, height: 1000 } },
    ];
    const mixedChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Mixed Chapter',
      pages: mixedPages,
      pageCount: 2,
    };
    const input = makeInput({ pageLayout: 'smartSpread' });
    input.chapter = mixedChapter as any;

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
      { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg', width: 600, height: 1000 } },
      { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg', width: 600, height: 1000 } },
    ];
    const coverChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Cover Portrait',
      pages: coverAndPortrait,
      pageCount: 2,
    };
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: false });
    input.chapter = coverChapter as any;

    const slots = calculatePageSlots(input);

    // Both are portrait, so they pair
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[1].isRightPage).toBe(true);
  });
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

    const firstSpread = plan.slots.filter(s => s.isCover);
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