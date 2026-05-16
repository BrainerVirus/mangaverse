import { describe, it, expect } from 'vitest';
import {
  resolveNavigationAction,
  applyNavigationAction,
  resolveKeyboardAction,
  resolveWheelAction,
} from './navigation';
import type { ReaderState, ReaderNavigationAction, ZoomStateSummary } from './types';

const mockPages = [
  { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
  { id: 'p4', index: 3, image: { url: 'http://example.com/4.jpg' } },
  { id: 'p5', index: 4, image: { url: 'http://example.com/5.jpg' } },
];

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
  wheelBehavior: 'scroll' as const,
};

const defaultZoom: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };

function makeState(overrides: Partial<{
  activePageIndex: number;
  chapterId: string;
  mode: 'page' | 'scroll';
  settings?: Partial<typeof defaultSettings>;
}> = {}): ReaderState {
  const settings = { ...defaultSettings, ...overrides.settings };
  return {
    chapterId: 'ch1',
    pages: mockPages as any,
    settings: settings as any,
    mode: 'page',
    activePageIndex: 0,
    visiblePageIndexes: [0],
    layout: 'single',
    zoom: defaultZoom,
    chromeVisible: false,
    failedPages: [],
    preloadQueue: [],
    diagnostics: {
      timestamp: new Date().toISOString(),
      chapterId: 'ch1',
      activePageIndex: 0,
      totalPages: 5,
      visiblePageIndexes: [0],
      settings: settings as any,
      zoom: defaultZoom,
      chromeVisible: false,
      failedPageCount: 0,
      preloadQueueLength: 0,
      lowMemoryMode: false,
      events: [],
    },
    ...overrides,
  } as ReaderState;
}

describe('resolveNavigationAction', () => {
  it('should resolve prevPage action in LTR', () => {
    const state = makeState({ activePageIndex: 2 });
    const action = resolveNavigationAction(state, { type: 'prevPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(1);
  });

  it('should resolve nextPage action in LTR', () => {
    const state = makeState({ activePageIndex: 2 });
    const action = resolveNavigationAction(state, { type: 'nextPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(3);
  });

  it('should clamp to first page for prevPage at start', () => {
    const state = makeState({ activePageIndex: 0 });
    const action = resolveNavigationAction(state, { type: 'prevPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(0);
  });

  it('should clamp to last page for nextPage at end', () => {
    const state = makeState({ activePageIndex: 4 });
    const action = resolveNavigationAction(state, { type: 'nextPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(4);
  });

  it('should resolve goToPage with exact index', () => {
    const state = makeState({ activePageIndex: 2 });
    const action = resolveNavigationAction(state, { type: 'goToPage', pageIndex: 4 });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(4);
  });

  it('should resolve firstPage action', () => {
    const state = makeState({ activePageIndex: 3 });
    const action = resolveNavigationAction(state, { type: 'firstPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(0);
  });

  it('should resolve lastPage action', () => {
    const state = makeState({ activePageIndex: 1 });
    const action = resolveNavigationAction(state, { type: 'lastPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(4);
  });
});

describe('applyNavigationAction', () => {
  it('should apply goToPage and update state', () => {
    const state = makeState({ activePageIndex: 0 });
    const action = { type: 'goToPage' as const, pageIndex: 3 };

    const newState = applyNavigationAction(state, action);

    expect(newState.activePageIndex).toBe(3);
  });

  it('should reset zoom on page navigation', () => {
    const state = makeState({ activePageIndex: 0 });
    state.zoom.scale = 2;

    const newState = applyNavigationAction(state, { type: 'goToPage', pageIndex: 1 });

    expect(newState.zoom.scale).toBe(1);
    expect(newState.zoom.translateX).toBe(0);
  });
});

describe('resolveKeyboardAction', () => {
  it('should return nextPage for ArrowRight in LTR', () => {
    const action = resolveKeyboardAction({ key: 'ArrowRight' }, defaultSettings as any);

    expect(action.type).toBe('nextPage');
  });

  it('should return prevPage for ArrowLeft in LTR', () => {
    const action = resolveKeyboardAction({ key: 'ArrowLeft' }, defaultSettings as any);

    expect(action.type).toBe('prevPage');
  });

  it('should invert for RTL', () => {
    const rtlSettings = { ...defaultSettings, readingMode: 'rtl' as const };
    const action = resolveKeyboardAction({ key: 'ArrowRight' }, rtlSettings as any);

    expect(action.type).toBe('prevPage');
  });

  it('should handle PageDown as nextPage', () => {
    const action = resolveKeyboardAction({ key: 'PageDown' }, defaultSettings as any);

    expect(action.type).toBe('nextPage');
  });

  it('should handle PageUp as prevPage', () => {
    const action = resolveKeyboardAction({ key: 'PageUp' }, defaultSettings as any);

    expect(action.type).toBe('prevPage');
  });

  it('should handle Home as firstPage', () => {
    const action = resolveKeyboardAction({ key: 'Home' }, defaultSettings as any);

    expect(action.type).toBe('firstPage');
  });

  it('should handle End as lastPage', () => {
    const action = resolveKeyboardAction({ key: 'End' }, defaultSettings as any);

    expect(action.type).toBe('lastPage');
  });

  it('should return none for unhandled keys', () => {
    const action = resolveKeyboardAction({ key: 'a' }, defaultSettings as any);

    expect(action.type).toBe('none');
  });
});

describe('resolveWheelAction', () => {
  it('should return scroll action for wheel events in vertical mode', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'scroll' as const, readingMode: 'vertical' as const };
    const action = resolveWheelAction({ deltaY: 100, deltaX: 0 }, settings as any);

    expect(action.type).toBe('scroll');
  });

  it('should return zoom action for wheel with Ctrl', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'zoom' as const };
    const action = resolveWheelAction({ deltaY: -100, deltaX: 0, ctrlKey: true }, settings as any);

    expect(action.type).toBe('zoom');
  });

  it('should return none when wheelBehavior is none', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'none' as const };
    const action = resolveWheelAction({ deltaY: 100, deltaX: 0 }, settings as any);

    expect(action.type).toBe('none');
  });
});