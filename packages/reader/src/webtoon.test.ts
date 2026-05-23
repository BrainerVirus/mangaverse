import { describe, it, expect } from 'vitest';
import {
  calculateWebtoonWindow,
  estimateWebtoonLayout,
} from './webtoon';
import type { ReaderSessionInput } from './types';

const mockPages = Array.from({ length: 100 }, (_, i) => ({
  id: `p${i}`,
  index: i,
  image: { url: `http://example.com/${i}.jpg`, width: 800, height: 1200 },
}));

const mockChapter = {
  id: 'ch1',
  mangaId: 'm1',
  title: 'Long Chapter',
  pages: mockPages,
  pageCount: 100,
};

const mockViewport = { width: 800, height: 600, orientation: 'portrait' as const };

const defaultSettings = {
  readingMode: 'vertical' as const,
  pageLayout: 'single' as const,
  tapZoneLayout: 'leftRight' as const,
  navigationDirection: 'default' as const,
  tapZoneDebugOverlay: false,
  minZoom: 1,
  maxZoom: 3,
  doubleTapZoom: 1.5,
  gestureSensitivity: 1,
  treatFirstPageAsCover: false,
  preloadAhead: 5,
  lowMemoryMode: false,
  verticalGapPx: 8,
};

function makeInput(overrides: Partial<typeof defaultSettings> = {}): ReaderSessionInput {
  return {
    chapter: mockChapter as any,
    viewport: mockViewport,
    settings: { ...defaultSettings, ...overrides },
  };
}

describe('calculateWebtoonWindow', () => {
  it('should return bounded visible window', () => {
    const input = makeInput();
    // Pass a realistic totalHeight so the calculation works
    const window = calculateWebtoonWindow(input, 0, 120000);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBeGreaterThanOrEqual(0);
    expect(window.endIndex).toBeLessThan(mockPages.length);
  });

  it('should return visible window for scroll position in middle', () => {
    const input = makeInput();
    const window = calculateWebtoonWindow(input, 50, 30000);

    expect(window.startIndex).toBeGreaterThan(0);
    expect(window.endIndex).toBeGreaterThanOrEqual(window.startIndex);
  });

  it('should include preload window ahead', () => {
    const input = makeInput({ preloadAhead: 5 });
    const window = calculateWebtoonWindow(input, 0, 0);

    expect(window.preloadEndIndex).toBeGreaterThan(window.endIndex);
  });

  it('should cap preload in low memory mode', () => {
    const input = makeInput({ preloadAhead: 10, lowMemoryMode: true });
    const window = calculateWebtoonWindow(input, 0, 0);

    expect(window.preloadEndIndex - window.endIndex).toBeLessThanOrEqual(1);
  });

  it('should handle gaps between pages for variable heights', () => {
    const pagesWithHeights = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      index: i,
      image: { url: `http://example.com/${i}.jpg`, width: 800, height: i % 2 === 0 ? 1200 : 800 },
    }));
    const chapterWithHeights = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Variable Heights',
      pages: pagesWithHeights,
      pageCount: 20,
    };
    const input = makeInput();
    input.chapter = chapterWithHeights as any;

    const window = calculateWebtoonWindow(input, 0, 0);

    expect(window.totalHeight).toBeGreaterThan(0);
  });
});

describe('estimateWebtoonLayout', () => {
  it('should estimate total scroll height', () => {
    const input = makeInput();
    const layout = estimateWebtoonLayout(input);

    expect(layout.totalHeight).toBeGreaterThan(mockViewport.height);
    expect(layout.pageCount).toBe(100);
  });

  it('should calculate page positions', () => {
    const input = makeInput();
    const layout = estimateWebtoonLayout(input);

    expect(layout.pagePositions).toHaveLength(100);
    expect(layout.pagePositions[0].top).toBe(0);
    expect(layout.pagePositions[0].index).toBe(0);
  });

  it('should account for vertical gap between pages', () => {
    const input = makeInput({ verticalGapPx: 16 });
    const layout = estimateWebtoonLayout(input);

    if (layout.pagePositions.length > 1) {
      const firstPageBottom = layout.pagePositions[0].top + layout.pagePositions[0].height;
      const secondPageTop = layout.pagePositions[1].top;
      expect(secondPageTop - firstPageBottom).toBe(16);
    }
  });

  it('should handle missing page dimensions', () => {
    const pagesWithoutDimensions = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      index: i,
      image: { url: `http://example.com/${i}.jpg` },
    }));
    const chapterNoDims = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'No Dimensions',
      pages: pagesWithoutDimensions,
      pageCount: 5,
    };
    const input = makeInput();
    input.chapter = chapterNoDims as any;

    const layout = estimateWebtoonLayout(input);

    expect(layout.pagePositions[0].height).toBe(mockViewport.height);
  });
});