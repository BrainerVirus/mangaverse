import { describe, expect, it } from 'vitest';
import { pendingVisiblePages } from './pending-pages';
import type { ReaderEngineSettings, ReaderSessionInput } from './types';

const settings: ReaderEngineSettings = {
  readingMode: 'ltr',
  pageLayout: 'single',
  tapZoneLayout: 'leftRight',
  fitMode: 'contain',
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

function input(
  patch: Partial<ReaderEngineSettings>,
  initialPageIndex?: number,
): ReaderSessionInput {
  return {
    // A hydrating chapter: its metadata is here, its pages are not.
    chapter: { id: 'ch1', mangaId: 'm1', title: 'Chapter 1', pages: [], pageCount: 0 },
    viewport: { width: 1280, height: 800, orientation: 'landscape' },
    settings: { ...settings, ...patch },
    ...(initialPageIndex === undefined ? {} : { initialPageIndex }),
  };
}

function indexes(patch: Partial<ReaderEngineSettings>, initialPageIndex?: number): number[] {
  return pendingVisiblePages(input(patch, initialPageIndex)).map((page) => page.index);
}

describe('pendingVisiblePages', () => {
  it('Given single pages or a strip, Then one slot stands in for the page the chapter opens on', () => {
    expect(indexes({ pageLayout: 'single' }, 3)).toEqual([3]);
    expect(indexes({ readingMode: 'vertical' }, 3)).toEqual([3]);
  });

  it('Given a double layout, Then the opening spread is two slots, a cover alone', () => {
    expect(indexes({ pageLayout: 'double' })).toEqual([0, 1]);
    expect(indexes({ pageLayout: 'double', readingMode: 'rtl' })).toEqual([1, 0]);
    expect(indexes({ pageLayout: 'double', treatFirstPageAsCover: true })).toEqual([0]);
    expect(indexes({ pageLayout: 'double', treatFirstPageAsCover: true }, 4)).toEqual([3, 4]);
  });

  it('Given smart spreads, Then pages of unknown shape stand alone, as the loaded ones will', () => {
    expect(indexes({ pageLayout: 'smartSpread' }, 2)).toEqual([2]);
  });

  it('Given no page shape, Then no slot claims a size', () => {
    for (const page of pendingVisiblePages(input({ pageLayout: 'double' }))) {
      expect(page.width ?? page.image.width).toBeUndefined();
    }
  });
});
