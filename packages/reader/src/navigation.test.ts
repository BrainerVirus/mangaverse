import { describe, it, expect } from 'vitest';
import { toChapterPageId } from '@app/shared';
import type { KeyboardShortcut } from '@app/shared';
import {
  resolveNavigationAction,
  applyNavigationAction,
  resolveKeyboardAction,
  resolveWheelAction,
} from './navigation';
import type { ReaderEngineSettings, ReaderPage, ReaderState, ZoomStateSummary } from './types';

const mockPages: readonly ReaderPage[] = [
  { id: toChapterPageId('p1'), index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: toChapterPageId('p2'), index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: toChapterPageId('p3'), index: 2, image: { url: 'http://example.com/3.jpg' } },
  { id: toChapterPageId('p4'), index: 3, image: { url: 'http://example.com/4.jpg' } },
  { id: toChapterPageId('p5'), index: 4, image: { url: 'http://example.com/5.jpg' } },
];

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

const defaultZoom: ZoomStateSummary = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  minZoom: 1,
  maxZoom: 3,
};

function makeState(
  overrides: Partial<Omit<ReaderState, 'settings'>> & {
    settings?: Partial<ReaderEngineSettings>;
  } = {},
): ReaderState {
  const { settings: settingsOverrides, ...stateOverrides } = overrides;
  const settings: ReaderEngineSettings = { ...defaultSettings, ...settingsOverrides };
  return {
    chapterId: 'ch1',
    pages: mockPages,
    settings,
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
      settings,
      zoom: defaultZoom,
      chromeVisible: false,
      failedPageCount: 0,
      preloadQueueLength: 0,
      lowMemoryMode: false,
      events: [],
    },
    ...stateOverrides,
  };
}

describe('resolveNavigationAction', () => {
  it.each(['rtl', 'ltr'] as const)(
    'keeps logical next/previous independent of %s input mapping',
    (readingMode) => {
      const state = makeState({ activePageIndex: 1, settings: { readingMode } });
      const key = readingMode === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      expect(
        resolveNavigationAction(state, resolveKeyboardAction({ key }, state.settings)),
      ).toEqual({ type: 'goToPage', pageIndex: 2 });
      expect(resolveNavigationAction(state, { type: 'prevPage' })).toEqual({
        type: 'goToPage',
        pageIndex: 0,
      });
    },
  );
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
    const base = makeState({ activePageIndex: 0 });
    const state = { ...base, zoom: { ...base.zoom, scale: 2 } };

    const newState = applyNavigationAction(state, { type: 'goToPage', pageIndex: 1 });

    expect(newState.zoom.scale).toBe(1);
    expect(newState.zoom.translateX).toBe(0);
  });
});

describe('resolveKeyboardAction', () => {
  it('should return nextPage for ArrowRight in LTR', () => {
    const action = resolveKeyboardAction({ key: 'ArrowRight' }, defaultSettings);

    expect(action.type).toBe('nextPage');
  });

  it('should return prevPage for ArrowLeft in LTR', () => {
    const action = resolveKeyboardAction({ key: 'ArrowLeft' }, defaultSettings);

    expect(action.type).toBe('prevPage');
  });

  it('should invert for RTL', () => {
    const rtlSettings = { ...defaultSettings, readingMode: 'rtl' as const };
    const action = resolveKeyboardAction({ key: 'ArrowRight' }, rtlSettings);

    expect(action.type).toBe('prevPage');
  });

  it('should handle PageDown as nextPage', () => {
    const action = resolveKeyboardAction({ key: 'PageDown' }, defaultSettings);

    expect(action.type).toBe('nextPage');
  });

  it('should handle PageUp as prevPage', () => {
    const action = resolveKeyboardAction({ key: 'PageUp' }, defaultSettings);

    expect(action.type).toBe('prevPage');
  });

  it('should handle Home as firstPage', () => {
    const action = resolveKeyboardAction({ key: 'Home' }, defaultSettings);

    expect(action.type).toBe('firstPage');
  });

  it('should handle End as lastPage', () => {
    const action = resolveKeyboardAction({ key: 'End' }, defaultSettings);

    expect(action.type).toBe('lastPage');
  });

  it('should return none for unhandled keys', () => {
    const action = resolveKeyboardAction({ key: 'a' }, defaultSettings);

    expect(action.type).toBe('none');
  });
});

describe('resolveKeyboardAction with saved shortcuts', () => {
  it('Given no saved bindings, When the displayed chapter shortcuts are pressed, Then they apply', () => {
    expect(resolveKeyboardAction({ key: 'ArrowRight', shiftKey: true }, defaultSettings).type).toBe(
      'nextChapter',
    );
    expect(resolveKeyboardAction({ key: 'h' }, defaultSettings).type).toBe('toggleChrome');
  });

  it('Given a saved key, When pressed, Then it resolves the bound action', () => {
    const settings = {
      ...defaultSettings,
      keyboardShortcuts: [{ action: 'nextPage' as const, key: 'n' }],
    };
    expect(resolveKeyboardAction({ key: 'n' }, settings).type).toBe('nextPage');
  });

  it('Given a saved binding on a built-in key, When pressed, Then the saved action wins', () => {
    const settings = {
      ...defaultSettings,
      keyboardShortcuts: [{ action: 'prevPage' as const, key: 'ArrowRight' }],
    };
    expect(resolveKeyboardAction({ key: 'ArrowRight' }, settings).type).toBe('prevPage');
  });

  it('Given a modifier binding, When pressed without the modifier, Then it does not fire', () => {
    const settings = {
      ...defaultSettings,
      keyboardShortcuts: [
        { action: 'toggleChrome', key: 'h', modifiers: ['Shift'] },
      ] as KeyboardShortcut[],
    };
    expect(resolveKeyboardAction({ key: 'h' }, settings).type).toBe('none');
    expect(resolveKeyboardAction({ key: 'h', shiftKey: true }, settings).type).toBe('toggleChrome');
  });

  it('Given a modified key with no binding, When pressed, Then the reader ignores it', () => {
    expect(resolveKeyboardAction({ key: 'ArrowRight', ctrlKey: true }, defaultSettings).type).toBe(
      'none',
    );
  });
});

describe('resolveWheelAction', () => {
  it('should return scroll action for wheel events in vertical mode', () => {
    const settings = {
      ...defaultSettings,
      wheelBehavior: 'scroll' as const,
      readingMode: 'vertical' as const,
    };
    const action = resolveWheelAction({ deltaY: 100, deltaX: 0 }, settings);

    expect(action.type).toBe('scroll');
  });

  it('should return zoom action for wheel with Ctrl', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'zoom' as const };
    const action = resolveWheelAction({ deltaY: -100, deltaX: 0, ctrlKey: true }, settings);

    expect(action.type).toBe('zoom');
  });

  it('should return none when wheelBehavior is none', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'none' as const };
    const action = resolveWheelAction({ deltaY: 100, deltaX: 0 }, settings);

    expect(action.type).toBe('none');
  });
});
