import { describe, it, expect } from 'vitest';
import { createReaderState } from './state';
import type { ReaderSessionInput } from './types';

const mockPages = [
  { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
  { id: 'p4', index: 3, image: { url: 'http://example.com/4.jpg' } },
];

const mockChapter = {
  id: 'ch1',
  mangaId: 'm1',
  title: 'Chapter 1',
  pages: mockPages,
  pageCount: 4,
};

const mockViewport = { width: 800, height: 600, orientation: 'landscape' as const };

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

describe('createReaderState', () => {
  it('should create reader state with single page layout', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: defaultSettings,
    };

    const state = createReaderState(input);

    expect(state.chapterId).toBe('ch1');
    expect(state.pages).toHaveLength(4);
    expect(state.activePageIndex).toBe(0);
    expect(state.mode).toBe('page');
    expect(state.chromeVisible).toBe(false);
    expect(state.failedPages).toHaveLength(0);
  });

  it('should respect initialPageIndex from input', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: defaultSettings,
      initialPageIndex: 2,
    };

    const state = createReaderState(input);

    expect(state.activePageIndex).toBe(2);
  });

  it('should clamp initialPageIndex to valid range', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: defaultSettings,
      initialPageIndex: 99,
    };

    const state = createReaderState(input);

    expect(state.activePageIndex).toBe(3);
  });

  it('should initialize zoom state to base zoom', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: defaultSettings,
    };

    const state = createReaderState(input);

    expect(state.zoom.scale).toBe(1);
    expect(state.zoom.translateX).toBe(0);
    expect(state.zoom.translateY).toBe(0);
    expect(state.zoom.minZoom).toBe(1);
    expect(state.zoom.maxZoom).toBe(3);
  });

  it('should use lowMemoryMode to cap preload queue', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: { ...defaultSettings, lowMemoryMode: true },
    };

    const state = createReaderState(input);

    expect(state.preloadQueue).toHaveLength(1);
  });

  it('should use preloadAhead for normal preload queue', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: { ...defaultSettings, preloadAhead: 3 },
    };

    const state = createReaderState(input);

    expect(state.preloadQueue).toHaveLength(3);
  });

  it('should use vertical mode for scroll mode', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: { ...defaultSettings, readingMode: 'vertical' },
    };

    const state = createReaderState(input);

    expect(state.mode).toBe('scroll');
  });

  it('should use page mode for ltr/rtl', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter as any,
      viewport: mockViewport,
      settings: { ...defaultSettings, readingMode: 'ltr' },
    };

    const state = createReaderState(input);

    expect(state.mode).toBe('page');
  });
});