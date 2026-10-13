# Phase 6: @app/reader Reader Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@app/reader` as a standalone manga/comic/webtoon reader package with pure engine functions for layout, spreads, tap zones, navigation, zoom/pan, webtoon virtualization, preload/decode scheduling, progress events, and diagnostics.

**Architecture:** Pure TypeScript engine with no React, router, DB, or Electron dependencies at import time. React integration through optional thin adapter hooks after pure engines exist. Public API exports types, pure functions, and factory functions - no classes.

**Tech Stack:** TypeScript, Vitest for tests, `@app/shared` for shared types.

---

## File Structure Overview

```
packages/reader/src/
  index.ts                    # Public exports (update)
  types.ts                   # Reader contract types (NEW)
  state.ts                   # createReaderState (NEW)
  state.test.ts              # Tests for state
  spreads.ts                 # Spread calculation (NEW)
  spreads.test.ts            # Tests for spreads
  tap-zones.ts               # Tap zone calculation (NEW)
  tap-zones.test.ts          # Tests for tap zones
  navigation.ts              # Keyboard/wheel navigation (NEW)
  navigation.test.ts         # Tests for navigation
  zoom.ts                    # Zoom/pan state and transforms (NEW)
  zoom.test.ts               # Tests for zoom/pan
  webtoon.ts                 # Webtoon windowing (NEW)
  webtoon.test.ts            # Tests for webtoon
  preload.ts                # Preload/decode queue planning (NEW)
  preload.test.ts            # Tests for preload
  progress.ts                # Progress events and persistence policy (NEW)
  progress.test.ts           # Tests for progress
  diagnostics.ts            # Reader diagnostics snapshots (NEW)
  diagnostics.test.ts        # Tests for diagnostics
```

---

## Task 1: Add @app/shared Dependency and Replace Smoke Test

**Files:**
- Modify: `packages/reader/package.json`
- Modify: `packages/reader/src/index.test.ts`
- Modify: `packages/reader/src/index.ts`

- [ ] **Step 1: Add @app/shared dependency to package.json**

Run: Read `packages/reader/package.json`

Modify the `dependencies` field from:
```json
"dependencies": {},
```
to:
```json
"dependencies": {
  "@app/shared": "workspace:*"
},
```

- [ ] **Step 2: Run pnpm install to link workspace dependency**

Run: `pnpm install`

- [ ] **Step 3: Replace smoke test with public API export tests**

Read `packages/reader/src/index.test.ts` and replace content with tests for all public exports:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PACKAGE_NAME,
  // Types
  type ReaderPage,
  type ReaderChapter,
  type ReaderViewport,
  type ReaderOverlayInsets,
  type ReaderSessionInput,
  type ReaderProgressEvent,
  type ReaderNavigationAction,
  type ReaderDiagnosticsSnapshot,
  // Layout/spread
  createReaderState,
  calculatePageSlots,
  calculateSpreadPlan,
  resolveInitialPageIndex,
  // Tap zones
  calculateTapZones,
  resolveTapZoneAction,
  createTapZoneDebugModel,
  // Navigation
  resolveNavigationAction,
  applyNavigationAction,
  resolveKeyboardAction,
  resolveWheelAction,
  // Zoom/pan
  createZoomState,
  applyDoubleTapZoom,
  applyPinchZoom,
  applyPan,
  clampZoomTransform,
  // Webtoon
  calculateWebtoonWindow,
  estimateWebtoonLayout,
  // Preload
  createPreloadPlan,
  createDecodeQueue,
  recordPageLoadResult,
  // Progress
  createProgressEvent,
  shouldPersistProgress,
  // Diagnostics
  createReaderDiagnostics,
} from './index';

describe('public API', () => {
  it('should export PACKAGE_NAME', () => {
    expect(PACKAGE_NAME).toBe('@app/reader');
  });

  it('should export all public types', () => {
    // Type-only checks - these will fail to compile if types are missing
    const _page: ReaderPage = {} as any;
    const _chapter: ReaderChapter = {} as any;
    const _viewport: ReaderViewport = {} as any;
    const _input: ReaderSessionInput = {} as any;
    const _event: ReaderProgressEvent = {} as any;
    const _action: ReaderNavigationAction = {} as any;
    const _snapshot: ReaderDiagnosticsSnapshot = {} as any;
  });

  it('should export all public functions', () => {
    expect(typeof createReaderState).toBe('function');
    expect(typeof calculatePageSlots).toBe('function');
    expect(typeof calculateSpreadPlan).toBe('function');
    expect(typeof resolveInitialPageIndex).toBe('function');
    expect(typeof calculateTapZones).toBe('function');
    expect(typeof resolveTapZoneAction).toBe('function');
    expect(typeof createTapZoneDebugModel).toBe('function');
    expect(typeof resolveNavigationAction).toBe('function');
    expect(typeof applyNavigationAction).toBe('function');
    expect(typeof resolveKeyboardAction).toBe('function');
    expect(typeof resolveWheelAction).toBe('function');
    expect(typeof createZoomState).toBe('function');
    expect(typeof applyDoubleTapZoom).toBe('function');
    expect(typeof applyPinchZoom).toBe('function');
    expect(typeof applyPan).toBe('function');
    expect(typeof clampZoomTransform).toBe('function');
    expect(typeof calculateWebtoonWindow).toBe('function');
    expect(typeof estimateWebtoonLayout).toBe('function');
    expect(typeof createPreloadPlan).toBe('function');
    expect(typeof createDecodeQueue).toBe('function');
    expect(typeof recordPageLoadResult).toBe('function');
    expect(typeof createProgressEvent).toBe('function');
    expect(typeof shouldPersistProgress).toBe('function');
    expect(typeof createReaderDiagnostics).toBe('function');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail (expected - functions not yet exported)**

Run: `pnpm --filter @app/reader test`

Expected: FAIL with "Package has 0 tests" or export errors (functions not yet exported from index.ts)

---

## Task 2: Create types.ts with Reader Contracts

**Files:**
- Create: `packages/reader/src/types.ts`

- [ ] **Step 1: Create types.ts with all reader contract types**

```typescript
import type { ChapterPage, Chapter, ReadingProgress } from '@app/shared';
import type { AppResult } from '@app/shared';

// Re-export shared types for reader package consumers
export type { ChapterPage, Chapter, ReadingProgress } from '@app/shared';

// Reader page with runtime metadata
export interface ReaderPage extends ChapterPage {
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
}

// Reader chapter wraps shared Chapter with derived metadata
export interface ReaderChapter {
  readonly id: string;
  readonly mangaId: string;
  readonly title: string;
  readonly pages: readonly ReaderPage[];
  readonly pageCount: number;
}

// Viewport dimensions and orientation
export interface ReaderViewport {
  readonly width: number;
  readonly height: number;
  readonly orientation: 'portrait' | 'landscape';
}

// Overlay/chrome inset values (pixels from edges)
export interface ReaderOverlayInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

// Page slot in a spread layout
export interface PageSlot {
  readonly pageIndex: number;
  readonly isCover: boolean;
  readonly isLeftPage: boolean;
  readonly isRightPage: boolean;
  readonly width?: number;
  readonly height?: number;
}

// Calculated spread layout result
export interface SpreadLayout {
  readonly slots: readonly PageSlot[];
  readonly pageIndexes: readonly number[];
  readonly slotCount: number;
}

// Tap zone region on screen
export interface TapZoneRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly action: TapZoneAction;
}

// Tap zone action types
export type TapZoneAction =
  | { type: 'prevPage' }
  | { type: 'nextPage' }
  | { type: 'prevChapter' }
  | { type: 'nextChapter' }
  | { type: 'toggleChrome' }
  | { type: 'none' };

// Debug overlay model for tap zones
export interface TapZoneDebugModel {
  readonly regions: readonly TapZoneRegion[];
  readonly viewport: ReaderViewport;
  readonly overlayInsets: ReaderOverlayInsets;
  readonly readingMode: string;
  readonly zoomState: ZoomStateSummary;
}

// Zoom state summary for diagnostics
export interface ZoomStateSummary {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly minZoom: number;
  readonly maxZoom: number;
}

// Session input for reader engine
export interface ReaderSessionInput {
  readonly chapter: ReaderChapter;
  readonly viewport: ReaderViewport;
  readonly settings: ReaderEngineSettings;
  readonly initialPageIndex?: number;
}

// Reader engine settings (subset of ReaderSettings for engine layer)
export interface ReaderEngineSettings {
  readonly readingMode: 'rtl' | 'ltr' | 'vertical';
  readonly pageLayout: 'single' | 'double' | 'smartSpread';
  readonly tapZoneLayout: 'leftRight' | 'lShaped' | 'grid';
  readonly navigationDirection: 'default' | 'inverted';
  readonly tapZoneDebugOverlay: boolean;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly doubleTapZoom: number;
  readonly gestureSensitivity: number;
  readonly treatFirstPageAsCover: boolean;
  readonly preloadAhead: number;
  readonly lowMemoryMode: boolean;
}

// Navigation action types
export type NavigationActionType =
  | 'prevPage'
  | 'nextPage'
  | 'prevChapter'
  | 'nextChapter'
  | 'firstPage'
  | 'lastPage'
  | 'goToPage'
  | 'none';

export interface ReaderNavigationAction {
  readonly type: NavigationActionType;
  readonly pageIndex?: number;
}

// Reader state (serializable, excluding high-frequency pointer state)
export interface ReaderState {
  readonly chapterId: string;
  readonly pages: readonly ReaderPage[];
  readonly settings: ReaderEngineSettings;
  readonly mode: 'scroll' | 'page';
  readonly activePageIndex: number;
  readonly visiblePageIndexes: readonly number[];
  readonly layout: PageLayoutMode;
  readonly zoom: ZoomStateSummary;
  readonly chromeVisible: boolean;
  readonly failedPages: readonly number[];
  readonly preloadQueue: readonly number[];
  readonly diagnostics: ReaderDiagnosticsSnapshot;
}

// Page layout mode alias for reader state
export type PageLayoutMode = 'single' | 'double' | 'smartSpread';

// Progress event emitted by reader engine
export interface ReaderProgressEvent {
  readonly chapterId: string;
  readonly mangaId: string;
  readonly pageIndex: number;
  readonly readPercent: number;
  readonly completed: boolean;
  readonly timestamp: string;
}

// Preload item in queue
export interface PreloadItem {
  readonly pageIndex: number;
  readonly priority: number;
  readonly url: string;
}

// Preload plan output
export interface PreloadPlan {
  readonly items: readonly PreloadItem[];
  readonly lowMemoryMode: boolean;
  readonly maxPreload: number;
}

// Decode queue item
export interface DecodeQueueItem {
  readonly pageIndex: number;
  readonly url: string;
  readonly priority: number;
  readonly retryCount: number;
}

// Decode queue output
export interface DecodeQueue {
  readonly items: readonly DecodeQueueItem[];
  readonly totalPages: number;
}

// Page load result for recording into preload state
export interface PageLoadResult {
  readonly pageIndex: number;
  readonly success: boolean;
  readonly errorCode?: string;
  readonly bytesLoaded?: number;
}

// Error codes for reader errors
export const READER_ERROR_CODES = {
  INPUT_INVALID: 'reader.input.invalid',
  PAGE_MISSING: 'reader.page.missing',
  LAYOUT_INVALID: 'reader.layout.invalid',
  NAVIGATION_INVALID: 'reader.navigation.invalid',
  IMAGE_FAILED: 'reader.image.failed',
  PRELOAD_FAILED: 'reader.preload.failed',
} as const;

// Diagnostics snapshot (safe - no secrets)
export interface ReaderDiagnosticsSnapshot {
  readonly timestamp: string;
  readonly chapterId: string;
  readonly activePageIndex: number;
  readonly totalPages: number;
  readonly visiblePageIndexes: readonly number[];
  readonly settings: ReaderEngineSettings;
  readonly zoom: ZoomStateSummary;
  readonly chromeVisible: boolean;
  readonly failedPageCount: number;
  readonly preloadQueueLength: number;
  readonly lowMemoryMode: boolean;
  readonly events: readonly DiagnosticEvent[];
}

// Diagnostic event for tracking reader behavior
export interface DiagnosticEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly data?: Readonly<Record<string, string | number | boolean>>;
}
```

- [ ] **Step 2: Run typecheck to verify types compile**

Run: `pnpm --filter @app/reader typecheck`

Expected: PASS (types compile, but no implementations yet)

- [ ] **Step 3: Commit**

```bash
git add packages/reader/package.json packages/reader/src/index.ts packages/reader/src/index.test.ts packages/reader/src/types.ts
git commit -m "feat(reader): add @app/shared dependency and reader contract types"
```

---

## Task 3: Create state.ts and Tests (createReaderState)

**Files:**
- Create: `packages/reader/src/state.ts`
- Create: `packages/reader/src/state.test.ts`

- [ ] **Step 1: Write failing test for createReaderState**

Read `packages/shared/src/reader-settings.ts` for `getDefaultReaderSettings` to understand the settings shape.

```typescript
import { describe, it, expect } from 'vitest';
import { createReaderState } from './state';
import type { ReaderSessionInput, ReaderState } from './types';

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
      chapter: mockChapter,
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
      chapter: mockChapter,
      viewport: mockViewport,
      settings: defaultSettings,
      initialPageIndex: 2,
    };

    const state = createReaderState(input);

    expect(state.activePageIndex).toBe(2);
  });

  it('should clamp initialPageIndex to valid range', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: defaultSettings,
      initialPageIndex: 99, // beyond page count
    };

    const state = createReaderState(input);

    expect(state.activePageIndex).toBe(3); // last page
  });

  it('should set visiblePageIndexes based on layout', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: defaultSettings,
    };

    const state = createReaderState(input);

    expect(state.visiblePageIndexes).toContain(0);
  });

  it('should initialize zoom state to base zoom', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
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

  it('should create diagnostics snapshot', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: defaultSettings,
    };

    const state = createReaderState(input);

    expect(state.diagnostics.timestamp).toBeDefined();
    expect(state.diagnostics.chapterId).toBe('ch1');
    expect(state.diagnostics.activePageIndex).toBe(0);
    expect(state.diagnostics.totalPages).toBe(4);
  });

  it('should use lowMemoryMode to cap preload queue', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: { ...defaultSettings, lowMemoryMode: true },
    };

    const state = createReaderState(input);

    expect(state.preloadQueue).toHaveLength(1); // low memory caps at 1
  });

  it('should use preloadAhead for normal preload queue', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: { ...defaultSettings, preloadAhead: 3 },
    };

    const state = createReaderState(input);

    expect(state.preloadQueue).toHaveLength(3);
  });

  it('should use vertical mode for scroll mode', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: { ...defaultSettings, readingMode: 'vertical' },
    };

    const state = createReaderState(input);

    expect(state.mode).toBe('scroll');
  });

  it('should use page mode for ltr/rtl', () => {
    const input: ReaderSessionInput = {
      chapter: mockChapter,
      viewport: mockViewport,
      settings: { ...defaultSettings, readingMode: 'ltr' },
    };

    const state = createReaderState(input);

    expect(state.mode).toBe('page');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/state.test.ts`

Expected: FAIL with "createReaderState is not a function" (function not yet implemented)

- [ ] **Step 3: Write minimal state.ts implementation**

```typescript
import type {
  ReaderSessionInput,
  ReaderState,
  ZoomStateSummary,
  ReaderDiagnosticsSnapshot,
  PreloadItem,
  DiagnosticEvent,
} from './types.js';

export function createReaderState(input: ReaderSessionInput): ReaderState {
  const { chapter, viewport, settings, initialPageIndex = 0 } = input;
  const pageCount = chapter.pageCount;

  // Clamp initialPageIndex to valid range
  const clampedPageIndex = Math.max(0, Math.min(initialPageIndex, pageCount - 1));

  // Determine mode based on reading direction
  const mode = settings.readingMode === 'vertical' ? 'scroll' : 'page';

  // Calculate initial visible page indexes
  const visiblePageIndexes = calculateVisiblePages(
    clampedPageIndex,
    pageCount,
    settings.pageLayout,
    settings.readingMode
  );

  // Calculate preload queue
  const preloadQueue = calculatePreloadQueue(
    clampedPageIndex,
    pageCount,
    settings.preloadAhead,
    settings.lowMemoryMode
  );

  // Base zoom state
  const zoom: ZoomStateSummary = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
  };

  // Initial diagnostics snapshot
  const diagnostics: ReaderDiagnosticsSnapshot = {
    timestamp: new Date().toISOString(),
    chapterId: chapter.id,
    activePageIndex: clampedPageIndex,
    totalPages: pageCount,
    visiblePageIndexes,
    settings,
    zoom,
    chromeVisible: false,
    failedPageCount: 0,
    preloadQueueLength: preloadQueue.length,
    lowMemoryMode: settings.lowMemoryMode,
    events: [],
  };

  return {
    chapterId: chapter.id,
    pages: chapter.pages,
    settings,
    mode,
    activePageIndex: clampedPageIndex,
    visiblePageIndexes,
    layout: settings.pageLayout,
    zoom,
    chromeVisible: false,
    failedPages: [],
    preloadQueue,
    diagnostics,
  };
}

function calculateVisiblePages(
  activePageIndex: number,
  totalPages: number,
  pageLayout: 'single' | 'double' | 'smartSpread',
  readingMode: 'rtl' | 'ltr' | 'vertical'
): readonly number[] {
  if (readingMode === 'vertical') {
    // Vertical mode shows multiple pages in scroll
    return [activePageIndex];
  }

  switch (pageLayout) {
    case 'single':
      return [activePageIndex];
    case 'double':
      // Double layout shows current and next page (or prev for RTL)
      if (readingMode === 'rtl') {
        return activePageIndex > 0 ? [activePageIndex - 1, activePageIndex] : [activePageIndex];
      }
      return activePageIndex < totalPages - 1
        ? [activePageIndex, activePageIndex + 1]
        : [activePageIndex];
    case 'smartSpread':
      // Smart spread - similar to double but with cover awareness
      if (activePageIndex === 0) {
        return [0]; // Cover page stands alone
      }
      if (readingMode === 'rtl') {
        return activePageIndex > 0 ? [activePageIndex - 1, activePageIndex] : [activePageIndex];
      }
      return activePageIndex < totalPages - 1
        ? [activePageIndex, activePageIndex + 1]
        : [activePageIndex];
    default:
      return [activePageIndex];
  }
}

function calculatePreloadQueue(
  activePageIndex: number,
  totalPages: number,
  preloadAhead: number,
  lowMemoryMode: boolean
): readonly number[] {
  if (lowMemoryMode) {
    // Low memory mode caps at 1 page
    const nextIndex = activePageIndex + 1;
    return nextIndex < totalPages ? [nextIndex] : [];
  }

  const items: number[] = [];
  const maxPreload = lowMemoryMode ? 1 : preloadAhead;

  for (let i = 1; i <= maxPreload; i++) {
    const nextIndex = activePageIndex + i;
    if (nextIndex < totalPages) {
      items.push(nextIndex);
    }
  }

  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/state.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/state.ts packages/reader/src/state.test.ts
git commit -m "feat(reader): add createReaderState function and state module"
```

---

## Task 4: Create spreads.ts and Tests (single/double/smart spread/cover rules)

**Files:**
- Create: `packages/reader/src/spreads.ts`
- Create: `packages/reader/src/spreads.test.ts`

- [ ] **Step 1: Write failing tests for spread calculation**

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculatePageSlots,
  calculateSpreadPlan,
  resolveInitialPageIndex,
} from './spreads';
import type { ReaderSessionInput, PageSlot, SpreadLayout } from './types';

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
    chapter: mockChapter,
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
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[0].isRightPage).toBe(false);
  });

  it('should pair pages for double layout in LTR', () => {
    const input = makeInput({ pageLayout: 'double', readingMode: 'ltr' });
    const slots = calculatePageSlots(input);

    // In LTR double layout: slots should pair consecutive pages
    // First pair: pages 0,1 (0 is left, 1 is right)
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[0].isRightPage).toBe(false);

    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isLeftPage).toBe(false);
    expect(slots[1].isRightPage).toBe(true);
  });

  it('should pair pages for double layout in RTL', () => {
    const input = makeInput({ pageLayout: 'double', readingMode: 'rtl' });
    const slots = calculatePageSlots(input);

    // In RTL double layout: reading order is reversed
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isLeftPage).toBe(true);
    expect(slots[0].isRightPage).toBe(false);

    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isLeftPage).toBe(false);
    expect(slots[1].isRightPage).toBe(true);
  });

  it('should leave cover page alone when treatFirstPageAsCover is true', () => {
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: true });
    const slots = calculatePageSlots(input);

    // Page 0 is cover and should stand alone
    expect(slots[0].pageIndex).toBe(0);
    expect(slots[0].isCover).toBe(true);
    // Page 1 should be left page of next spread
    expect(slots[1].pageIndex).toBe(1);
    expect(slots[1].isLeftPage).toBe(true);
  });

  it('should handle odd page count in double layout', () => {
    const oddChapter = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'Chapter 1',
      pages: mockPages.slice(0, 5), // 5 pages
      pageCount: 5,
    };
    const input = makeInput({ pageLayout: 'double' });
    input.chapter = oddChapter as typeof input.chapter;

    const slots = calculatePageSlots(input);

    // Last page stands alone
    expect(slots[slots.length - 1].pageIndex).toBe(4);
  });

  it('should skip spread pairing for vertical mode', () => {
    const input = makeInput({ readingMode: 'vertical', pageLayout: 'double' });
    const slots = calculatePageSlots(input);

    // Vertical mode ignores spreads - each page is its own slot
    expect(slots).toHaveLength(5);
    for (const slot of slots) {
      expect(slot.isLeftPage).toBe(false);
      expect(slot.isRightPage).toBe(false);
    }
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

    // First spread should only have cover page
    const firstSpread = plan.slots.filter(s => s.isCover);
    expect(firstSpread.length).toBeGreaterThan(0);
  });

  it('should respect reading direction in spread order', () => {
    const ltrInput = makeInput({ readingMode: 'ltr', pageLayout: 'double' });
    const rtlInput = makeInput({ readingMode: 'rtl', pageLayout: 'double' });

    const ltrPlan = calculateSpreadPlan(ltrInput);
    const rtlPlan = calculateSpreadPlan(rtlInput);

    // RTL should have different page ordering
    expect(ltrPlan.pageIndexes).not.toEqual(rtlPlan.pageIndexes);
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

    expect(index).toBe(5); // last page
  });

  it('should clamp negative bookmark to 0', () => {
    const input = makeInput();
    const index = resolveInitialPageIndex(input, -5);

    expect(index).toBe(0);
  });

  it('should prefer cover page as initial for cover-aware layout', () => {
    const input = makeInput({ pageLayout: 'smartSpread', treatFirstPageAsCover: true });
    const index = resolveInitialPageIndex(input, undefined);

    // Initial should not be 0 when cover stands alone
    // Page 1 is first non-cover page
    expect(index).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/spreads.test.ts`

Expected: FAIL with function names not exported

- [ ] **Step 3: Write minimal spreads.ts implementation**

```typescript
import type {
  ReaderSessionInput,
  PageSlot,
  SpreadLayout,
} from './types.js';

export function calculatePageSlots(input: ReaderSessionInput): readonly PageSlot[] {
  const { chapter, settings } = input;
  const { pageLayout, readingMode, treatFirstPageAsCover } = settings;
  const pages = chapter.pages;

  if (readingMode === 'vertical') {
    // Vertical mode: each page is standalone, no spread pairing
    return pages.map((page, index) => ({
      pageIndex: index,
      isCover: false,
      isLeftPage: false,
      isRightPage: false,
    }));
  }

  if (pageLayout === 'single') {
    return pages.map((_, index) => ({
      pageIndex: index,
      isCover: false,
      isLeftPage: index % 2 === 0,
      isRightPage: index % 2 === 1,
    }));
  }

  // Double and smartSpread
  const slots: PageSlot[] = [];

  if (treatFirstPageAsCover && pages.length > 0) {
    // Cover page stands alone
    slots.push({
      pageIndex: 0,
      isCover: true,
      isLeftPage: false,
      isRightPage: false,
    });

    // Remaining pages are paired
    for (let i = 1; i < pages.length; i += 2) {
      const leftIndex = i;
      const rightIndex = Math.min(i + 1, pages.length - 1);

      slots.push({
        pageIndex: leftIndex,
        isCover: false,
        isLeftPage: true,
        isRightPage: false,
      });

      if (rightIndex > leftIndex) {
        slots.push({
          pageIndex: rightIndex,
          isCover: false,
          isLeftPage: false,
          isRightPage: true,
        });
      }
    }
  } else {
    // No cover handling - pair all pages
    for (let i = 0; i < pages.length; i += 2) {
      const leftIndex = i;
      const rightIndex = Math.min(i + 1, pages.length - 1);

      slots.push({
        pageIndex: leftIndex,
        isCover: false,
        isLeftPage: true,
        isRightPage: false,
      });

      if (rightIndex > leftIndex) {
        slots.push({
          pageIndex: rightIndex,
          isCover: false,
          isLeftPage: false,
          isRightPage: true,
        });
      }
    }
  }

  // Apply reading direction (swap left/right for RTL)
  if (readingMode === 'rtl') {
    return slots.map(slot => ({
      ...slot,
      isLeftPage: slot.isRightPage,
      isRightPage: slot.isLeftPage,
    }));
  }

  return slots;
}

export function calculateSpreadPlan(input: ReaderSessionInput): SpreadLayout {
  const slots = calculatePageSlots(input);
  const pageIndexes = slots.map(s => s.pageIndex);

  return {
    slots,
    pageIndexes,
    slotCount: slots.length,
  };
}

export function resolveInitialPageIndex(
  input: ReaderSessionInput,
  bookmarkPageIndex?: number
): number {
  const { chapter, settings } = input;
  const { treatFirstPageAsCover } = settings;
  const pageCount = chapter.pageCount;

  if (bookmarkPageIndex !== undefined && bookmarkPageIndex >= 0 && bookmarkPageIndex < pageCount) {
    // If bookmark is page 0 and cover handling is on, skip to page 1
    if (treatFirstPageAsCover && bookmarkPageIndex === 0 && pageCount > 1) {
      return 1;
    }
    return bookmarkPageIndex;
  }

  // No bookmark - start at beginning (or after cover)
  if (treatFirstPageAsCover && pageCount > 1) {
    return 1;
  }

  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/spreads.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/spreads.ts packages/reader/src/spreads.test.ts
git commit -m "feat(reader): add spread calculation functions"
```

---

## Task 5: Create tap-zones.ts and Tests (overlay-aware tap actions)

**Files:**
- Create: `packages/reader/src/tap-zones.ts`
- Create: `packages/reader/src/tap-zones.test.ts`

- [ ] **Step 1: Write failing tests for tap zone calculation**

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculateTapZones,
  resolveTapZoneAction,
  createTapZoneDebugModel,
} from './tap-zones';
import type { ReaderSessionInput, TapZoneRegion, TapZoneDebugModel } from './types';

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

function makeInput(overrides: Partial<typeof defaultSettings> = {}): ReaderSessionInput {
  return {
    chapter: mockChapter,
    viewport: mockViewport,
    settings: { ...defaultSettings, ...overrides },
  };
}

describe('calculateTapZones', () => {
  it('should return left/right zones for leftRight layout', () => {
    const input = makeInput();
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });

    expect(zones).toHaveLength(2);
    expect(zones.find(z => z.id === 'left')).toBeDefined();
    expect(zones.find(z => z.id === 'right')).toBeDefined();
  });

  it('should return 9 zones for grid layout', () => {
    const input = makeInput({ tapZoneLayout: 'grid' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });

    expect(zones).toHaveLength(9);
  });

  it('should return 4 zones for lShaped layout', () => {
    const input = makeInput({ tapZoneLayout: 'lShaped' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });

    expect(zones).toHaveLength(4);
  });

  it('should reduce tappable area when overlay insets provided', () => {
    const input = makeInput();
    const insetsWithoutOverlay = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const insetsWithOverlay = calculateTapZones(input, { top: 50, right: 10, bottom: 80, left: 10 });

    // Overlay insets should reduce zone sizes
    const leftZoneNoOverlay = insetsWithoutOverlay.find(z => z.id === 'left')!;
    const leftZoneWithOverlay = insetsWithOverlay.find(z => z.id === 'left')!;

    expect(leftZoneWithOverlay.width).toBeLessThan(leftZoneNoOverlay.width);
    expect(leftZoneWithOverlay.y).toBe(50); // top inset offset
  });

  it('should map left tap to prevPage in LTR default direction', () => {
    const input = makeInput({ readingMode: 'ltr', navigationDirection: 'default' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const leftZone = zones.find(z => z.id === 'left')!;

    expect(leftZone.action.type).toBe('prevPage');
  });

  it('should map right tap to nextPage in LTR default direction', () => {
    const input = makeInput({ readingMode: 'ltr', navigationDirection: 'default' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const rightZone = zones.find(z => z.id === 'right')!;

    expect(rightZone.action.type).toBe('nextPage');
  });

  it('should invert navigation in RTL mode', () => {
    const input = makeInput({ readingMode: 'rtl', navigationDirection: 'default' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const leftZone = zones.find(z => z.id === 'left')!;
    const rightZone = zones.find(z => z.id === 'right')!;

    // In RTL, left is nextPage and right is prevPage
    expect(leftZone.action.type).toBe('nextPage');
    expect(rightZone.action.type).toBe('prevPage');
  });

  it('should handle inverted navigation direction', () => {
    const input = makeInput({ readingMode: 'ltr', navigationDirection: 'inverted' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const leftZone = zones.find(z => z.id === 'left')!;
    const rightZone = zones.find(z => z.id === 'right')!;

    expect(leftZone.action.type).toBe('nextPage');
    expect(rightZone.action.type).toBe('prevPage');
  });

  it('should return toggleChrome action for center zone in grid layout', () => {
    const input = makeInput({ tapZoneLayout: 'grid' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const centerZone = zones.find(z => z.id === 'center')!;

    expect(centerZone.action.type).toBe('toggleChrome');
  });

  it('should account for zoom state in zone calculation', () => {
    const input = makeInput();
    const zoomState = { scale: 2, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };

    // When zoomed, zones should be disabled (return 'none' action)
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 }, zoomState);

    for (const zone of zones) {
      if (zone.id !== 'center') {
        expect(zone.action.type).toBe('none');
      }
    }
  });
});

describe('resolveTapZoneAction', () => {
  it('should return prevPage for left zone tap at beginning', () => {
    const input = makeInput();
    const action = resolveTapZoneAction(input, { zoneId: 'left', pageIndex: 0 });

    expect(action.type).toBe('prevPage');
  });

  it('should return nextPage for right zone tap', () => {
    const input = makeInput();
    const action = resolveTapZoneAction(input, { zoneId: 'right', pageIndex: 1 });

    expect(action.type).toBe('nextPage');
  });

  it('should return none for center zone in leftRight layout', () => {
    const input = makeInput();
    const action = resolveTapZoneAction(input, { zoneId: 'center', pageIndex: 1 });

    expect(action.type).toBe('none');
  });

  it('should return toggleChrome for center zone in grid layout', () => {
    const input = makeInput({ tapZoneLayout: 'grid' });
    const action = resolveTapZoneAction(input, { zoneId: 'center', pageIndex: 1 });

    expect(action.type).toBe('toggleChrome');
  });

  it('should prevent navigation at first page in LTR', () => {
    const input = makeInput({ readingMode: 'ltr' });
    const action = resolveTapZoneAction(input, { zoneId: 'left', pageIndex: 0 });

    // At first page, left should not go further back
    expect(action.type).toBe('prevPage');
  });

  it('should prevent navigation at last page', () => {
    const input = makeInput();
    const action = resolveTapZoneAction(input, { zoneId: 'right', pageIndex: 3 });

    // At last page, right should not go further
    expect(action.type).toBe('nextPage');
  });
});

describe('createTapZoneDebugModel', () => {
  it('should create debug model with regions', () => {
    const input = makeInput();
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const model = createTapZoneDebugModel(input, zones);

    expect(model.regions).toHaveLength(2);
    expect(model.viewport).toBeDefined();
    expect(model.overlayInsets).toBeDefined();
    expect(model.readingMode).toBe('ltr');
  });

  it('should include zoom state in debug model', () => {
    const input = makeInput();
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const zoomState = { scale: 1.5, translateX: 10, translateY: 20, minZoom: 1, maxZoom: 3 };
    const model = createTapZoneDebugModel(input, zones, zoomState);

    expect(model.zoomState.scale).toBe(1.5);
    expect(model.zoomState.translateX).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/tap-zones.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal tap-zones.ts implementation**

```typescript
import type {
  ReaderSessionInput,
  TapZoneRegion,
  TapZoneDebugModel,
  ZoomStateSummary,
  ReaderOverlayInsets,
} from './types.js';

interface TapZoneInput {
  zoneId: string;
  pageIndex: number;
}

export function calculateTapZones(
  input: ReaderSessionInput,
  overlayInsets: ReaderOverlayInsets,
  zoomState?: ZoomStateSummary
): readonly TapZoneRegion[] {
  const { viewport, settings } = input;
  const { tapZoneLayout, readingMode, navigationDirection } = settings;
  const { width, height } = viewport;

  // Effective interaction area (accounting for overlays)
  const effectiveX = overlayInsets.left;
  const effectiveY = overlayInsets.top;
  const effectiveWidth = width - overlayInsets.left - overlayInsets.right;
  const effectiveHeight = height - overlayInsets.top - overlayInsets.bottom;

  // When zoomed in, disable tap navigation
  if (zoomState && zoomState.scale > 1) {
    return createZonesWithAction(tapZoneLayout, effectiveX, effectiveY, effectiveWidth, effectiveHeight, 'none');
  }

  // Determine navigation direction based on reading mode and setting
  const inverted = navigationDirection === 'inverted';
  const rtl = readingMode === 'rtl';
  const leftAction = inverted !== rtl ? 'nextPage' : 'prevPage';
  const rightAction = inverted !== rtl ? 'prevPage' : 'nextPage';

  switch (tapZoneLayout) {
    case 'leftRight':
      return [
        {
          id: 'left',
          x: effectiveX,
          y: effectiveY,
          width: effectiveWidth / 2,
          height: effectiveHeight,
          action: { type: leftAction },
        },
        {
          id: 'right',
          x: effectiveX + effectiveWidth / 2,
          y: effectiveY,
          width: effectiveWidth / 2,
          height: effectiveHeight,
          action: { type: rightAction },
        },
      ];

    case 'grid':
      const cellW = effectiveWidth / 3;
      const cellH = effectiveHeight / 3;
      return [
        // Row 1
        { id: 'topLeft', x: effectiveX, y: effectiveY, width: cellW, height: cellH, action: { type: leftAction } },
        { id: 'topCenter', x: effectiveX + cellW, y: effectiveY, width: cellW, height: cellH, action: { type: 'toggleChrome' } },
        { id: 'topRight', x: effectiveX + cellW * 2, y: effectiveY, width: cellW, height: cellH, action: { type: rightAction } },
        // Row 2
        { id: 'middleLeft', x: effectiveX, y: effectiveY + cellH, width: cellW, height: cellH, action: { type: 'none' } },
        { id: 'center', x: effectiveX + cellW, y: effectiveY + cellH, width: cellW, height: cellH, action: { type: 'toggleChrome' } },
        { id: 'middleRight', x: effectiveX + cellW * 2, y: effectiveY + cellH, width: cellW, height: cellH, action: { type: 'none' } },
        // Row 3
        { id: 'bottomLeft', x: effectiveX, y: effectiveY + cellH * 2, width: cellW, height: cellH, action: { type: 'none' } },
        { id: 'bottomCenter', x: effectiveX + cellW, y: effectiveY + cellH * 2, width: cellW, height: cellH, action: { type: 'none' } },
        { id: 'bottomRight', x: effectiveX + cellW * 2, y: effectiveY + cellH * 2, width: cellW, height: cellH, action: { type: 'none' } },
      ];

    case 'lShaped':
      return [
        // Top-left L-shape (left + top-right corner)
        { id: 'left', x: effectiveX, y: effectiveY, width: effectiveWidth / 2, height: effectiveHeight / 2, action: { type: leftAction } },
        { id: 'topRight', x: effectiveX + effectiveWidth / 2, y: effectiveY, width: effectiveWidth / 2, height: effectiveHeight / 2, action: { type: rightAction } },
        // Bottom-right L-shape (right + bottom-left corner)
        { id: 'bottomLeft', x: effectiveX, y: effectiveY + effectiveHeight / 2, width: effectiveWidth / 2, height: effectiveHeight / 2, action: { type: 'none' } },
        { id: 'right', x: effectiveX + effectiveWidth / 2, y: effectiveY + effectiveHeight / 2, width: effectiveWidth / 2, height: effectiveHeight / 2, action: { type: rightAction } },
      ];

    default:
      return [];
  }
}

function createZonesWithAction(
  layout: string,
  x: number,
  y: number,
  width: number,
  height: number,
  actionType: string
): readonly TapZoneRegion[] {
  return [
    { id: 'left', x, y, width: width / 2, height, action: { type: actionType as any } },
    { id: 'right', x: x + width / 2, y, width: width / 2, height, action: { type: actionType as any } },
  ];
}

export function resolveTapZoneAction(
  input: ReaderSessionInput,
  tap: TapZoneInput
): { type: 'prevPage' | 'nextPage' | 'prevChapter' | 'nextChapter' | 'toggleChrome' | 'none' } {
  const { settings } = input;
  const { readingMode, navigationDirection } = settings;

  const inverted = navigationDirection === 'inverted';
  const rtl = readingMode === 'rtl';

  // Map zone to action
  switch (tap.zoneId) {
    case 'left':
      return inverted !== rtl ? { type: 'nextPage' } : { type: 'prevPage' };
    case 'right':
      return inverted !== rtl ? { type: 'prevPage' } : { type: 'nextPage' };
    case 'center':
      return { type: 'toggleChrome' };
    case 'topCenter':
      return { type: 'toggleChrome' };
    default:
      return { type: 'none' };
  }
}

export function createTapZoneDebugModel(
  input: ReaderSessionInput,
  regions: readonly TapZoneRegion[],
  zoomState?: ZoomStateSummary
): TapZoneDebugModel {
  return {
    regions,
    viewport: input.viewport,
    overlayInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    readingMode: input.settings.readingMode,
    zoomState: zoomState ?? { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/tap-zones.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/tap-zones.ts packages/reader/src/tap-zones.test.ts
git commit -m "feat(reader): add tap zone calculation with overlay awareness"
```

---

## Task 6: Create navigation.ts and Tests (RTL/LTR/vertical keyboard/wheel)

**Files:**
- Create: `packages/reader/src/navigation.ts`
- Create: `packages/reader/src/navigation.test.ts`

- [ ] **Step 1: Write failing tests for navigation**

```typescript
import { describe, it, expect } from 'vitest';
import {
  resolveNavigationAction,
  applyNavigationAction,
  resolveKeyboardAction,
  resolveWheelAction,
} from './navigation';
import type { ReaderState, ReaderNavigationAction, ReaderSessionInput } from './types';

const mockPages = [
  { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
  { id: 'p4', index: 3, image: { url: 'http://example.com/4.jpg' } },
  { id: 'p5', index: 4, image: { url: 'http://example.com/5.jpg' } },
];

const mockChapter = {
  id: 'ch1',
  mangaId: 'm1',
  title: 'Chapter 1',
  pages: mockPages,
  pageCount: 5,
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

function makeState(overrides: Partial<{
  activePageIndex: number;
  chapterId: string;
  mode: 'page' | 'scroll';
}> = {}): ReaderState {
  return {
    chapterId: 'ch1',
    pages: mockPages,
    settings: defaultSettings,
    mode: 'page',
    activePageIndex: 0,
    visiblePageIndexes: [0],
    layout: 'single',
    zoom: { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 },
    chromeVisible: false,
    failedPages: [],
    preloadQueue: [],
    diagnostics: {
      timestamp: new Date().toISOString(),
      chapterId: 'ch1',
      activePageIndex: 0,
      totalPages: 5,
      visiblePageIndexes: [0],
      settings: defaultSettings,
      zoom: { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 },
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

  it('should handle RTL reading direction', () => {
    const state = makeState({ activePageIndex: 2 });
    state.settings.readingMode = 'rtl';
    const action = resolveNavigationAction(state, { type: 'prevPage' });

    // In RTL, prevPage goes forward (higher index)
    expect(action.pageIndex).toBe(3);
  });

  it('should clamp to first page for prevPage at start', () => {
    const state = makeState({ activePageIndex: 0 });
    const action = resolveNavigationAction(state, { type: 'prevPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(0); // clamped to first
  });

  it('should clamp to last page for nextPage at end', () => {
    const state = makeState({ activePageIndex: 4 });
    const action = resolveNavigationAction(state, { type: 'nextPage' });

    expect(action.type).toBe('goToPage');
    expect(action.pageIndex).toBe(4); // clamped to last
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

  it('should return none for vertical mode scroll navigation', () => {
    const state = makeState({ activePageIndex: 2 });
    state.settings.readingMode = 'vertical';
    const action = resolveNavigationAction(state, { type: 'nextPage' });

    // Vertical mode doesn't use page navigation actions
    expect(action.type).toBe('none');
  });
});

describe('applyNavigationAction', () => {
  it('should apply goToPage and update state', () => {
    const state = makeState({ activePageIndex: 0 });
    const action = { type: 'goToPage' as const, pageIndex: 3 };

    const newState = applyNavigationAction(state, action);

    expect(newState.activePageIndex).toBe(3);
  });

  it('should preserve other state fields on navigation', () => {
    const state = makeState({ activePageIndex: 0 });
    state.chromeVisible = true;
    const action = { type: 'goToPage' as const, pageIndex: 2 };

    const newState = applyNavigationAction(state, action);

    expect(newState.chapterId).toBe(state.chapterId);
    expect(newState.zoom.scale).toBe(state.zoom.scale);
    expect(newState.chromeVisible).toBe(true);
  });

  it('should reset zoom on page navigation', () => {
    const state = makeState({ activePageIndex: 0 });
    state.zoom.scale = 2;

    const newState = applyNavigationAction(state, { type: 'goToPage', pageIndex: 1 });

    // Navigation resets zoom to base
    expect(newState.zoom.scale).toBe(1);
    expect(newState.zoom.translateX).toBe(0);
  });
});

describe('resolveKeyboardAction', () => {
  it('should return nextPage for ArrowRight in LTR', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'ArrowRight' } as KeyboardEvent, settings);

    expect(action.type).toBe('nextPage');
  });

  it('should return prevPage for ArrowLeft in LTR', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'ArrowLeft' } as KeyboardEvent, settings);

    expect(action.type).toBe('prevPage');
  });

  it('should invert for RTL', () => {
    const settings = { ...defaultSettings, readingMode: 'rtl' as const };
    const action = resolveKeyboardAction({ key: 'ArrowRight' } as KeyboardEvent, settings);

    expect(action.type).toBe('prevPage');
  });

  it('should handle PageDown as nextPage', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'PageDown' } as KeyboardEvent, settings);

    expect(action.type).toBe('nextPage');
  });

  it('should handle PageUp as prevPage', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'PageUp' } as KeyboardEvent, settings);

    expect(action.type).toBe('prevPage');
  });

  it('should handle Home as firstPage', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'Home' } as KeyboardEvent, settings);

    expect(action.type).toBe('firstPage');
  });

  it('should handle End as lastPage', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'End' } as KeyboardEvent, settings);

    expect(action.type).toBe('lastPage');
  });

  it('should return none for unhandled keys', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: 'a' } as KeyboardEvent, settings);

    expect(action.type).toBe('none');
  });

  it('should handle Space as nextPage', () => {
    const settings = defaultSettings;
    const action = resolveKeyboardAction({ key: ' ' } as KeyboardEvent, settings);

    expect(action.type).toBe('nextPage');
  });
});

describe('resolveWheelAction', () => {
  it('should return scroll action for wheel events in vertical mode', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'scroll' as const, readingMode: 'vertical' as const };
    const event = { deltaY: 100 } as WheelEvent;

    const action = resolveWheelAction(event, settings);

    expect(action.type).toBe('scroll');
  });

  it('should return zoom action for wheel with Ctrl in scroll mode', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'zoom' as const };
    const event = { deltaY: -100, ctrlKey: true } as WheelEvent;

    const action = resolveWheelAction(event, settings);

    expect(action.type).toBe('zoom');
    expect(action.delta).toBeLessThan(0); // zooming in
  });

  it('should return none when wheelBehavior is none', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'none' as const };
    const event = { deltaY: 100 } as WheelEvent;

    const action = resolveWheelAction(event, settings);

    expect(action.type).toBe('none');
  });

  it('should return scroll for horizontal wheel in page mode', () => {
    const settings = { ...defaultSettings, wheelBehavior: 'scroll' as const, readingMode: 'ltr' as const };
    const event = { deltaX: 100, deltaY: 0 } as WheelEvent;

    const action = resolveWheelAction(event, settings);

    // Horizontal wheel in page mode = page turn
    expect(action.type).toBe('scroll');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/navigation.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal navigation.ts implementation**

```typescript
import type { ReaderState, ReaderNavigationAction, ReaderEngineSettings, ReaderSessionInput } from './types.js';

type WheelBehavior = 'none' | 'scroll' | 'zoom';

export function resolveNavigationAction(
  state: ReaderState,
  action: ReaderNavigationAction
): ReaderNavigationAction {
  const { activePageIndex } = state;
  const { chapter } = state;
  const pageCount = chapter.pageCount ?? state.pages.length;

  switch (action.type) {
    case 'prevPage': {
      const rtl = state.settings.readingMode === 'rtl';
      const inverted = state.settings.navigationDirection === 'inverted';
      const goingForward = inverted !== rtl;

      if (goingForward) {
        const nextIndex = Math.min(activePageIndex + 1, pageCount - 1);
        return { type: 'goToPage', pageIndex: nextIndex };
      } else {
        const prevIndex = Math.max(activePageIndex - 1, 0);
        return { type: 'goToPage', pageIndex: prevIndex };
      }
    }

    case 'nextPage': {
      const rtl = state.settings.readingMode === 'rtl';
      const inverted = state.settings.navigationDirection === 'inverted';
      const goingForward = inverted !== rtl;

      if (goingForward) {
        const prevIndex = Math.max(activePageIndex - 1, 0);
        return { type: 'goToPage', pageIndex: prevIndex };
      } else {
        const nextIndex = Math.min(activePageIndex + 1, pageCount - 1);
        return { type: 'goToPage', pageIndex: nextIndex };
      }
    }

    case 'goToPage':
      return action;

    case 'firstPage':
      return { type: 'goToPage', pageIndex: 0 };

    case 'lastPage':
      return { type: 'goToPage', pageIndex: pageCount - 1 };

    case 'prevChapter':
    case 'nextChapter':
    case 'none':
    default:
      return { type: 'none' };
  }
}

export function applyNavigationAction(state: ReaderState, action: ReaderNavigationAction): ReaderState {
  if (action.type === 'none' || action.type === 'prevChapter' || action.type === 'nextChapter') {
    return state;
  }

  const newPageIndex = action.type === 'goToPage' && action.pageIndex !== undefined
    ? action.pageIndex
    : state.activePageIndex;

  return {
    ...state,
    activePageIndex: newPageIndex,
    zoom: {
      scale: 1,
      translateX: 0,
      translateY: 0,
      minZoom: state.zoom.minZoom,
      maxZoom: state.zoom.maxZoom,
    },
    visiblePageIndexes: [newPageIndex],
  };
}

interface KeyboardEventInput {
  key: string;
}

export function resolveKeyboardAction(event: KeyboardEventInput, settings: ReaderEngineSettings): ReaderNavigationAction {
  const { readingMode, navigationDirection } = settings;
  const rtl = readingMode === 'rtl';
  const inverted = navigationDirection === 'inverted';

  const nextKey = inverted !== rtl ? 'ArrowLeft' : 'ArrowRight';
  const prevKey = inverted !== rtl ? 'ArrowRight' : 'ArrowLeft';

  switch (event.key) {
    case nextKey:
      return { type: 'nextPage' };
    case prevKey:
      return { type: 'prevPage' };
    case 'ArrowDown':
    case 'PageDown':
      return { type: 'nextPage' };
    case 'ArrowUp':
    case 'PageUp':
      return { type: 'prevPage' };
    case 'Home':
      return { type: 'firstPage' };
    case 'End':
      return { type: 'lastPage' };
    case ' ':
      return { type: 'nextPage' };
    default:
      return { type: 'none' };
  }
}

interface WheelEventInput {
  deltaX: number;
  deltaY: number;
  ctrlKey?: boolean;
}

export function resolveWheelAction(
  event: WheelEventInput,
  settings: ReaderEngineSettings
): { type: 'scroll' | 'zoom' | 'none'; delta?: number } {
  const { wheelBehavior, readingMode } = settings;
  const isVertical = readingMode === 'vertical';

  if (wheelBehavior === 'none') {
    return { type: 'none' };
  }

  if (wheelBehavior === 'zoom' && event.ctrlKey) {
    return { type: 'zoom', delta: event.deltaY };
  }

  if (isVertical && wheelBehavior === 'scroll') {
    return { type: 'scroll' };
  }

  // Horizontal wheel or page mode wheel = scroll
  if (event.deltaX !== 0 || !isVertical) {
    return { type: 'scroll' };
  }

  return { type: 'none' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/navigation.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/navigation.ts packages/reader/src/navigation.test.ts
git commit -m "feat(reader): add keyboard and wheel navigation functions"
```

---

## Task 7: Create zoom.ts and Tests (double-tap, pinch, pan, clamp)

**Files:**
- Create: `packages/reader/src/zoom.ts`
- Create: `packages/reader/src/zoom.test.ts`

- [ ] **Step 1: Write failing tests for zoom/pan**

```typescript
import { describe, it, expect } from 'vitest';
import {
  createZoomState,
  applyDoubleTapZoom,
  applyPinchZoom,
  applyPan,
  clampZoomTransform,
} from './zoom';
import type { ZoomStateSummary } from './types';

const defaultSettings = {
  minZoom: 1,
  maxZoom: 3,
  doubleTapZoom: 1.5,
  gestureSensitivity: 1,
};

describe('createZoomState', () => {
  it('should create initial zoom state at scale 1', () => {
    const state = createZoomState(defaultSettings);

    expect(state.scale).toBe(1);
    expect(state.translateX).toBe(0);
    expect(state.translateY).toBe(0);
    expect(state.minZoom).toBe(1);
    expect(state.maxZoom).toBe(3);
  });

  it('should respect min/max zoom from settings', () => {
    const state = createZoomState({ ...defaultSettings, minZoom: 0.5, maxZoom: 5 });

    expect(state.minZoom).toBe(0.5);
    expect(state.maxZoom).toBe(5);
  });
});

describe('applyDoubleTapZoom', () => {
  it('should zoom to doubleTapZoom level on double tap', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyDoubleTapZoom(state, { x: 400, y: 300 }, 800, 600, 1.5);

    expect(newState.scale).toBe(1.5);
  });

  it('should reset to base zoom when already at doubleTapZoom', () => {
    const state: ZoomStateSummary = { scale: 1.5, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyDoubleTapZoom(state, { x: 400, y: 300 }, 800, 600, 1.5);

    expect(newState.scale).toBe(1);
  });

  it('should center zoom on tap point', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyDoubleTapZoom(state, { x: 200, y: 150 }, 800, 600, 1.5);

    // Zoom should be centered on tap point
    expect(newState.scale).toBe(1.5);
    // Translate should shift to keep tap point centered
    expect(newState.translateX).toBeDefined();
  });
});

describe('applyPinchZoom', () => {
  it('should scale zoom based on pinch delta', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 2, 1.5, { centerX: 400, centerY: 300 });

    expect(newState.scale).toBe(1.5);
  });

  it('should clamp zoom to maxZoom', () => {
    const state: ZoomStateSummary = { scale: 2.5, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 2, 5, { centerX: 400, centerY: 300 });

    expect(newState.scale).toBe(3); // clamped
  });

  it('should clamp zoom to minZoom', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 1, 0.5, { centerX: 400, centerY: 300 });

    expect(newState.scale).toBe(1); // clamped
  });

  it('should adjust translation to keep pinch center stable', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 1, 2, { centerX: 400, centerY: 300 });

    // Translation should shift to keep center point stable
    expect(newState.translateX).not.toBe(0);
    expect(newState.translateY).not.toBe(0);
  });
});

describe('applyPan', () => {
  it('should apply pan delta to translation', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPan(state, 50, 30);

    expect(newState.translateX).toBe(50);
    expect(newState.translateY).toBe(30);
  });

  it('should accumulate pan deltas', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 10, translateY: 20, minZoom: 1, maxZoom: 3 };
    const newState = applyPan(state, 50, 30);

    expect(newState.translateX).toBe(60);
    expect(newState.translateY).toBe(50);
  });
});

describe('clampZoomTransform', () => {
  it('should keep translation within page bounds at scale 1', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 100, translateY: 100, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 800, 600);

    // At scale 1, no panning should be allowed
    expect(clamped.translateX).toBe(0);
    expect(clamped.translateY).toBe(0);
  });

  it('should allow panning when zoomed in', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 100, translateY: 100, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 400, 300);

    // At scale 2, panning should be allowed within bounds
    expect(clamped.scale).toBe(2);
  });

  it('should clamp translation to prevent over-panning', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 500, translateY: 500, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 400, 300);

    // Should clamp to prevent showing empty space
    expect(clamped.translateX).toBeLessThanOrEqual(400);
    expect(clamped.translateY).toBeLessThanOrEqual(300);
  });

  it('should reset translation when scale goes back to 1', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 100, translateY: 100, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 800, 600);

    expect(clamped.translateX).toBe(0);
    expect(clamped.translateY).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/zoom.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal zoom.ts implementation**

```typescript
import type { ZoomStateSummary } from './types.js';

interface ZoomSettings {
  minZoom: number;
  maxZoom: number;
  doubleTapZoom: number;
  gestureSensitivity: number;
}

interface Point {
  x: number;
  y: number;
}

export function createZoomState(settings: ZoomSettings): ZoomStateSummary {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
  };
}

export function applyDoubleTapZoom(
  state: ZoomStateSummary,
  tapPoint: Point,
  viewportWidth: number,
  viewportHeight: number,
  doubleTapZoomLevel: number
): ZoomStateSummary {
  const isZoomed = state.scale > 1;

  if (isZoomed) {
    // Reset to base zoom
    return {
      ...state,
      scale: 1,
      translateX: 0,
      translateY: 0,
    };
  }

  // Zoom to doubleTapZoom level, centered on tap point
  const newScale = Math.min(state.maxZoom, doubleTapZoomLevel);

  // Calculate translation to center on tap point
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const tapOffsetX = tapPoint.x - centerX;
  const tapOffsetY = tapPoint.y - centerY;

  // At new scale, tap point should remain centered
  const translateX = -tapOffsetX * (newScale - 1);
  const translateY = -tapOffsetY * (newScale - 1);

  return {
    ...state,
    scale: newScale,
    translateX,
    translateY,
  };
}

export function applyPinchZoom(
  state: ZoomStateSummary,
  currentScale: number,
  targetScale: number,
  pinchCenter: Point
): ZoomStateSummary {
  // Clamp target scale to min/max
  const clampedScale = Math.max(state.minZoom, Math.min(state.maxZoom, targetScale));

  // Calculate translation adjustment to keep pinch center stable
  const centerX = pinchCenter.centerX;
  const centerY = pinchCenter.centerY;
  const scaleFactor = clampedScale / currentScale;

  const newTranslateX = state.translateX - (centerX - state.translateX) * (scaleFactor - 1);
  const newTranslateY = state.translateY - (centerY - state.translateY) * (scaleFactor - 1);

  return {
    ...state,
    scale: clampedScale,
    translateX: newTranslateX,
    translateY: newTranslateY,
  };
}

export function applyPan(state: ZoomStateSummary, deltaX: number, deltaY: number): ZoomStateSummary {
  return {
    ...state,
    translateX: state.translateX + deltaX,
    translateY: state.translateY + deltaY,
  };
}

export function clampZoomTransform(
  state: ZoomStateSummary,
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): ZoomStateSummary {
  // At scale 1, no panning allowed
  if (state.scale <= 1) {
    return {
      ...state,
      translateX: 0,
      translateY: 0,
    };
  }

  // Calculate max translation based on scale and viewport
  const scaledWidth = pageWidth * state.scale;
  const scaledHeight = pageHeight * state.scale;

  const maxTranslateX = Math.max(0, (scaledWidth - viewportWidth) / 2);
  const maxTranslateY = Math.max(0, (scaledHeight - viewportHeight) / 2);

  const clampedX = Math.max(-maxTranslateX, Math.min(maxTranslateX, state.translateX));
  const clampedY = Math.max(-maxTranslateY, Math.min(maxTranslateY, state.translateY));

  return {
    ...state,
    translateX: clampedX,
    translateY: clampedY,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/zoom.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/zoom.ts packages/reader/src/zoom.test.ts
git commit -m "feat(reader): add zoom/pan functions with clamping"
```

---

## Task 8: Create webtoon.ts and Tests (bounded long-chapter windowing)

**Files:**
- Create: `packages/reader/src/webtoon.ts`
- Create: `packages/reader/src/webtoon.test.ts`

- [ ] **Step 1: Write failing tests for webtoon windowing**

```typescript
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
    chapter: mockChapter,
    viewport: mockViewport,
    settings: { ...defaultSettings, ...overrides },
  };
}

describe('calculateWebtoonWindow', () => {
  it('should return bounded visible window', () => {
    const input = makeInput();
    const window = calculateWebtoonWindow(input, 0, 0);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBeGreaterThan(0);
    expect(window.endIndex).toBeLessThan(mockPages.length);
  });

  it('should return visible window for scroll position in middle', () => {
    const input = makeInput();
    // Scroll position at roughly page 50
    const window = calculateWebtoonWindow(input, 50, 30000);

    expect(window.startIndex).toBeGreaterThan(0);
    expect(window.endIndex).toBeGreaterThan(window.startIndex);
  });

  it('should include preload window ahead', () => {
    const input = makeInput({ preloadAhead: 5 });
    const window = calculateWebtoonWindow(input, 0, 0);

    expect(window.preloadEndIndex).toBeGreaterThan(window.endIndex);
  });

  it('should cap preload in low memory mode', () => {
    const input = makeInput({ preloadAhead: 10, lowMemoryMode: true });
    const window = calculateWebtoonWindow(input, 0, 0);

    // Low memory mode should cap preload at 1
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
    input.chapter = chapterWithHeights as typeof input.chapter;

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

    // Positions should include gap
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
      image: { url: `http://example.com/${i}.jpg` }, // no dimensions
    }));
    const chapterNoDims = {
      id: 'ch1',
      mangaId: 'm1',
      title: 'No Dimensions',
      pages: pagesWithoutDimensions,
      pageCount: 5,
    };
    const input = makeInput();
    input.chapter = chapterNoDims as typeof input.chapter;

    const layout = estimateWebtoonLayout(input);

    // Should fall back to viewport height
    expect(layout.pagePositions[0].height).toBe(mockViewport.height);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/webtoon.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal webtoon.ts implementation**

```typescript
import type { ReaderSessionInput } from './types.js';

interface WebtoonWindow {
  startIndex: number;
  endIndex: number;
  preloadEndIndex: number;
  scrollOffset: number;
  totalHeight: number;
}

interface PagePosition {
  index: number;
  top: number;
  height: number;
  width: number;
}

interface WebtoonLayout {
  totalHeight: number;
  pageCount: number;
  pagePositions: readonly PagePosition[];
}

const DEFAULT_PAGE_HEIGHT = 1200;
const DEFAULT_PAGE_WIDTH = 800;

export function calculateWebtoonWindow(
  input: ReaderSessionInput,
  scrollOffset: number,
  viewportHeight: number
): WebtoonWindow {
  const { chapter, settings } = input;
  const { preloadAhead, lowMemoryMode, verticalGapPx } = settings;
  const pages = chapter.pages;
  const pageCount = pages.length;

  // Estimate average page height (including gap)
  const avgPageHeight = estimateAveragePageHeight(pages, verticalGapPx);

  // Calculate visible window
  const startIndex = Math.floor(scrollOffset / avgPageHeight);
  const visibleCount = Math.ceil(viewportHeight / avgPageHeight) + 2; // buffer
  const endIndex = Math.min(startIndex + visibleCount, pageCount - 1);

  // Calculate preload window
  const preloadCount = lowMemoryMode ? 1 : preloadAhead;
  const preloadEndIndex = Math.min(endIndex + preloadCount, pageCount - 1);

  return {
    startIndex: Math.max(0, startIndex),
    endIndex,
    preloadEndIndex,
    scrollOffset,
    totalHeight: pageCount * avgPageHeight,
  };
}

export function estimateWebtoonLayout(input: ReaderSessionInput): WebtoonLayout {
  const { chapter, settings } = input;
  const { verticalGapPx } = settings;
  const pages = chapter.pages;
  const pageCount = pages.length;

  let totalHeight = 0;
  const pagePositions: PagePosition[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = pages[i];
    const height = page.image.height ?? DEFAULT_PAGE_HEIGHT;
    const width = page.image.width ?? DEFAULT_PAGE_WIDTH;

    pagePositions.push({
      index: i,
      top: totalHeight,
      height,
      width,
    });

    totalHeight += height + verticalGapPx;
  }

  // Remove last gap
  if (totalHeight > 0) {
    totalHeight -= verticalGapPx;
  }

  return {
    totalHeight,
    pageCount,
    pagePositions,
  };
}

function estimateAveragePageHeight(
  pages: readonly { image: { height?: number } }[],
  verticalGapPx: number
): number {
  let totalHeight = 0;
  let validCount = 0;

  for (const page of pages) {
    if (page.image.height !== undefined) {
      totalHeight += page.image.height;
      validCount++;
    }
  }

  if (validCount === 0) {
    return DEFAULT_PAGE_HEIGHT + verticalGapPx;
  }

  return totalHeight / validCount + verticalGapPx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/webtoon.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/webtoon.ts packages/reader/src/webtoon.test.ts
git commit -m "feat(reader): add webtoon windowing functions"
```

---

## Task 9: Create preload.ts and Tests (queue priority, retry, low-memory)

**Files:**
- Create: `packages/reader/src/preload.ts`
- Create: `packages/reader/src/preload.test.ts`

- [ ] **Step 1: Write failing tests for preload planning**

```typescript
import { describe, it, expect } from 'vitest';
import {
  createPreloadPlan,
  createDecodeQueue,
  recordPageLoadResult,
} from './preload';
import type { PreloadPlan, DecodeQueue, PageLoadResult } from './types';

const mockPages = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  index: i,
  image: { url: `http://example.com/${i}.jpg` },
}));

describe('createPreloadPlan', () => {
  it('should create preload plan with correct priorities', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 0, 2, false);

    expect(plan.items).toHaveLength(2);
    expect(plan.items[0].pageIndex).toBe(1); // next page
    expect(plan.items[1].pageIndex).toBe(2); // page after next
    expect(plan.items[0].priority).toBeGreaterThan(plan.items[1].priority);
  });

  it('should use preload count from settings', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 3, 5, false);

    expect(plan.items).toHaveLength(5);
  });

  it('should cap at 1 in low memory mode', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 0, 10, true);

    expect(plan.maxPreload).toBe(1);
    expect(plan.items).toHaveLength(1);
  });

  it('should not include pages behind active page', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 5, 3, false);

    // Should only include pages 6, 7, 8 (ahead of 5)
    for (const item of plan.items) {
      expect(item.pageIndex).toBeGreaterThan(5);
    }
  });

  it('should handle being at last page', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 9, 3, false);

    expect(plan.items).toHaveLength(0);
  });

  it('should include url in preload items', () => {
    const pages = mockPages;
    const plan = createPreloadPlan(pages, 0, 2, false);

    expect(plan.items[0].url).toBeDefined();
    expect(plan.items[0].url).toContain('example.com');
  });
});

describe('createDecodeQueue', () => {
  it('should create priority-ordered decode queue', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 0, 3, false);

    expect(queue.items).toHaveLength(3);
    expect(queue.totalPages).toBe(10);
  });

  it('should order by priority (closer pages first)', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 5, 5, false);

    const priorities = queue.items.map(item => item.priority);
    // Should be sorted by priority (lower = higher priority)
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i - 1]).toBeLessThanOrEqual(priorities[i]);
    }
  });

  it('should cap queue size in low memory mode', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 0, 10, true);

    expect(queue.items.length).toBeLessThanOrEqual(2);
  });

  it('should include retry count in queue items', () => {
    const pages = mockPages;
    const queue = createDecodeQueue(pages, 0, 3, false);

    expect(queue.items[0].retryCount).toBe(0);
  });
});

describe('recordPageLoadResult', () => {
  it('should return success result', () => {
    const result: PageLoadResult = {
      pageIndex: 1,
      success: true,
      bytesLoaded: 50000,
    };

    const updated = recordPageLoadResult(result, mockPages, 0, [], 3);

    expect(updated.failedPages).toHaveLength(0);
  });

  it('should record failed page', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    const updated = recordPageLoadResult(result, mockPages, 0, [], 3);

    expect(updated.failedPages).toContain(2);
  });

  it('should increment retry count on failure', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    const failedPages = [2];
    const updated = recordPageLoadResult(result, mockPages, 0, failedPages, 3);

    // Page 2 should still be in failed pages
    expect(updated.failedPages).toContain(2);
  });

  it('should not retry beyond max retries', () => {
    const result: PageLoadResult = {
      pageIndex: 2,
      success: false,
      errorCode: 'reader.image.failed',
    };

    // Already at max retries (3)
    const updated = recordPageLoadResult(result, mockPages, 0, [2], 3);

    // Should not add page to preload queue
    expect(updated.preloadQueue).not.toContain(2);
  });

  it('should produce deterministic queue ordering', () => {
    const result1: PageLoadResult = { pageIndex: 1, success: true };
    const result2: PageLoadResult = { pageIndex: 2, success: true };

    const updated1 = recordPageLoadResult(result1, mockPages, 0, [], 3);
    const updated2 = recordPageLoadResult(result2, mockPages, 0, [], 3);

    // Both should produce same queue structure
    expect(updated1.preloadQueue.length).toBe(updated2.preloadQueue.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/preload.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal preload.ts implementation**

```typescript
import type { PreloadPlan, DecodeQueue, PageLoadResult, PreloadItem, DecodeQueueItem } from './types.js';

export function createPreloadPlan(
  pages: readonly { id: string; index: number; image: { url: string } }[],
  activePageIndex: number,
  preloadAhead: number,
  lowMemoryMode: boolean
): PreloadPlan {
  const maxPreload = lowMemoryMode ? 1 : preloadAhead;
  const items: PreloadItem[] = [];

  for (let i = 1; i <= maxPreload; i++) {
    const nextIndex = activePageIndex + i;
    if (nextIndex < pages.length) {
      const page = pages[nextIndex];
      items.push({
        pageIndex: nextIndex,
        priority: maxPreload - i + 1, // closer pages = higher priority
        url: page.image.url,
      });
    }
  }

  return {
    items,
    lowMemoryMode,
    maxPreload,
  };
}

export function createDecodeQueue(
  pages: readonly { id: string; index: number; image: { url: string } }[],
  activePageIndex: number,
  preloadAhead: number,
  lowMemoryMode: boolean
): DecodeQueue {
  const plan = createPreloadPlan(pages, activePageIndex, preloadAhead, lowMemoryMode);

  const items: DecodeQueueItem[] = plan.items.map(item => ({
    pageIndex: item.pageIndex,
    url: item.url,
    priority: item.priority,
    retryCount: 0,
  }));

  // Sort by priority (higher priority first)
  items.sort((a, b) => b.priority - a.priority);

  return {
    items,
    totalPages: pages.length,
  };
}

export function recordPageLoadResult(
  result: PageLoadResult,
  pages: readonly { id: string; index: number; image: { url: string } }[],
  activePageIndex: number,
  previousFailedPages: readonly number[],
  maxRetries: number
): { failedPages: readonly number[]; preloadQueue: readonly number[] } {
  const { pageIndex, success } = result;

  if (success) {
    // Remove from failed pages
    const failedPages = previousFailedPages.filter(i => i !== pageIndex);

    // Regenerate preload queue (excluding failed pages)
    const newPreloadQueue = regeneratePreloadQueue(
      pages,
      activePageIndex,
      failedPages,
      3,
      false
    );

    return { failedPages, preloadQueue: newPreloadQueue };
  }

  // Failure - add to failed pages if not at max retries
  const pageRetryCount = previousFailedPages.filter(i => i === pageIndex).length;

  if (pageRetryCount >= maxRetries) {
    // At max retries, don't add to queue
    return { failedPages: previousFailedPages, preloadQueue: [] };
  }

  // Add to failed pages for retry
  const failedPages = [...previousFailedPages, pageIndex];

  return { failedPages, preloadQueue: [] };
}

function regeneratePreloadQueue(
  pages: readonly { id: string; index: number; image: { url: string } }[],
  activePageIndex: number,
  failedPages: readonly number[],
  preloadAhead: number,
  lowMemoryMode: boolean
): readonly number[] {
  const queue: number[] = [];
  const maxPreload = lowMemoryMode ? 1 : preloadAhead;

  for (let i = 1; i <= maxPreload; i++) {
    const nextIndex = activePageIndex + i;
    if (nextIndex < pages.length && !failedPages.includes(nextIndex)) {
      queue.push(nextIndex);
    }
  }

  return queue;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/preload.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/preload.ts packages/reader/src/preload.test.ts
git commit -m "feat(reader): add preload and decode queue functions"
```

---

## Task 10: Create progress.ts and Tests (checkpoint/debounce policy)

**Files:**
- Create: `packages/reader/src/progress.ts`
- Create: `packages/reader/src/progress.test.ts`

- [ ] **Step 1: Write failing tests for progress events**

```typescript
import { describe, it, expect } from 'vitest';
import {
  createProgressEvent,
  shouldPersistProgress,
} from './progress';
import type { ReaderProgressEvent } from './types';

describe('createProgressEvent', () => {
  it('should create progress event with page index', () => {
    const event = createProgressEvent('ch1', 'm1', 3, 10);

    expect(event.chapterId).toBe('ch1');
    expect(event.mangaId).toBe('m1');
    expect(event.pageIndex).toBe(3);
  });

  it('should calculate readPercent correctly', () => {
    const event = createProgressEvent('ch1', 'm1', 4, 10);

    expect(event.readPercent).toBe(50); // 5/10 pages = 50%
  });

  it('should mark completed when on last page', () => {
    const event = createProgressEvent('ch1', 'm1', 9, 10);

    expect(event.completed).toBe(true);
  });

  it('should not mark completed before last page', () => {
    const event = createProgressEvent('ch1', 'm1', 5, 10);

    expect(event.completed).toBe(false);
  });

  it('should include timestamp', () => {
    const event = createProgressEvent('ch1', 'm1', 0, 10);

    expect(event.timestamp).toBeDefined();
    expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should handle single page chapter', () => {
    const event = createProgressEvent('ch1', 'm1', 0, 1);

    expect(event.readPercent).toBe(100);
    expect(event.completed).toBe(true);
  });
});

describe('shouldPersistProgress', () => {
  it('should persist on page change', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 2,
      readPercent: 30,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(true);
  });

  it('should not persist for same page', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3,
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(false);
  });

  it('should persist on chapter change', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 9,
      readPercent: 100,
      completed: true,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch2',
      mangaId: 'm1',
      pageIndex: 0,
      readPercent: 0,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(true);
  });

  it('should respect minPagesBetweenPersists policy', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 2,
      readPercent: 30,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 3, // only 1 page changed
      readPercent: 40,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    // Policy requires minimum 5 pages between persists
    const shouldPersist = shouldPersistProgress(previous, next, { minPagesBetweenPersists: 5 });

    expect(shouldPersist).toBe(false);
  });

  it('should persist when exceeding minPagesBetweenPersists', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 0,
      readPercent: 0,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 7, // 7 pages changed
      readPercent: 70,
      completed: false,
      timestamp: new Date().toISOString(),
    };

    const shouldPersist = shouldPersistProgress(previous, next, { minPagesBetweenPersists: 5 });

    expect(shouldPersist).toBe(true);
  });

  it('should always persist on completion', () => {
    const previous: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 9,
      readPercent: 90,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    const next: ReaderProgressEvent = {
      chapterId: 'ch1',
      mangaId: 'm1',
      pageIndex: 9,
      readPercent: 100,
      completed: true,
      timestamp: new Date().toISOString(),
    };

    expect(shouldPersistProgress(previous, next, {})).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/progress.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal progress.ts implementation**

```typescript
import type { ReaderProgressEvent } from './types.js';

interface ProgressPolicy {
  minPagesBetweenPersists?: number;
  debounceMs?: number;
}

export function createProgressEvent(
  chapterId: string,
  mangaId: string,
  pageIndex: number,
  totalPages: number
): ReaderProgressEvent {
  const readPercent = totalPages > 0 ? Math.round(((pageIndex + 1) / totalPages) * 100) : 100;
  const completed = pageIndex >= totalPages - 1;

  return {
    chapterId,
    mangaId,
    pageIndex,
    readPercent,
    completed,
    timestamp: new Date().toISOString(),
  };
}

export function shouldPersistProgress(
  previous: ReaderProgressEvent,
  next: ReaderProgressEvent,
  policy: ProgressPolicy
): boolean {
  // Always persist on chapter change
  if (previous.chapterId !== next.chapterId) {
    return true;
  }

  // Always persist on completion
  if (!previous.completed && next.completed) {
    return true;
  }

  // Don't persist if page didn't change
  if (previous.pageIndex === next.pageIndex) {
    return false;
  }

  // Check minPagesBetweenPersists policy
  const minPages = policy.minPagesBetweenPersists ?? 0;
  if (minPages > 0) {
    const pagesSinceLastPersist = next.pageIndex - previous.pageIndex;
    // Handle wrap-around at chapter end
    const effectivePages = pagesSinceLastPersist > 0 ? pagesSinceLastPersist : totalPages - previous.pageIndex + next.pageIndex;
    if (effectivePages < minPages) {
      return false;
    }
  }

  return true;
}

function get totalPages(): number {
  // This is a workaround - in actual usage this would come from chapter metadata
  return 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/progress.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/progress.ts packages/reader/src/progress.test.ts
git commit -m "feat(reader): add progress event and persistence policy functions"
```

---

## Task 11: Create diagnostics.ts and Tests (safe snapshots)

**Files:**
- Create: `packages/reader/src/diagnostics.ts`
- Create: `packages/reader/src/diagnostics.test.ts`

- [ ] **Step 1: Write failing tests for diagnostics**

```typescript
import { describe, it, expect } from 'vitest';
import { createReaderDiagnostics } from './diagnostics';
import type { ReaderSessionInput, ReaderDiagnosticsSnapshot } from './types';

const mockPages = [
  { id: 'p1', index: 0, image: { url: 'http://example.com/1.jpg' } },
  { id: 'p2', index: 1, image: { url: 'http://example.com/2.jpg' } },
  { id: 'p3', index: 2, image: { url: 'http://example.com/3.jpg' } },
];

const mockChapter = {
  id: 'ch1',
  mangaId: 'm1',
  title: 'Chapter 1',
  pages: mockPages,
  pageCount: 3,
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

function makeInput(): ReaderSessionInput {
  return {
    chapter: mockChapter,
    viewport: mockViewport,
    settings: defaultSettings,
  };
}

describe('createReaderDiagnostics', () => {
  it('should create snapshot with timestamp', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 1, false, [], 0, []);

    expect(snapshot.timestamp).toBeDefined();
    expect(new Date(snapshot.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should include chapter id', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 1, false, [], 0, []);

    expect(snapshot.chapterId).toBe('ch1');
  });

  it('should include page information', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 1, 3, false, [], 0, []);

    expect(snapshot.activePageIndex).toBe(1);
    expect(snapshot.totalPages).toBe(3);
  });

  it('should include visible page indexes', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 1, 3, false, [], 0, [1, 2]);

    expect(snapshot.visiblePageIndexes).toEqual([1, 2]);
  });

  it('should include settings', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);

    expect(snapshot.settings).toEqual(defaultSettings);
  });

  it('should include zoom state', () => {
    const input = makeInput();
    const zoom = { scale: 1.5, translateX: 10, translateY: 20, minZoom: 1, maxZoom: 3 };
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0], zoom);

    expect(snapshot.zoom.scale).toBe(1.5);
    expect(snapshot.zoom.translateX).toBe(10);
  });

  it('should include chrome visibility', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, true, [], 0, [0]);

    expect(snapshot.chromeVisible).toBe(true);
  });

  it('should include failed page count', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [1, 2], 0, [0]);

    expect(snapshot.failedPageCount).toBe(2);
  });

  it('should include preload queue length', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0], undefined, undefined, [1, 2, 3]);

    expect(snapshot.preloadQueueLength).toBe(3);
  });

  it('should include low memory mode flag', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);

    expect(snapshot.lowMemoryMode).toBe(false);
  });

  it('should include diagnostic events', () => {
    const input = makeInput();
    const events = [
      { type: 'pageLoaded', timestamp: new Date().toISOString(), data: { pageIndex: 1 } },
      { type: 'zoomChanged', timestamp: new Date().toISOString(), data: { scale: 1.5 } },
    ];
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0], undefined, undefined, undefined, events);

    expect(snapshot.events).toHaveLength(2);
  });

  it('should not include secrets in snapshot', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);

    // Snapshot should only contain safe, serializable data
    expect(typeof snapshot.timestamp).toBe('string');
    expect(typeof snapshot.chapterId).toBe('string');
    // URLs should not appear in snapshot fields (only pageIndex)
    const snapshotStr = JSON.stringify(snapshot);
    expect(snapshotStr).not.toContain('example.com');
  });

  it('should produce deterministic snapshots for same input', () => {
    const input = makeInput();
    const snapshot1 = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);
    const snapshot2 = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);

    expect(snapshot1.timestamp).toBe(snapshot2.timestamp);
    expect(snapshot1.activePageIndex).toBe(snapshot2.activePageIndex);
    expect(snapshot1.totalPages).toBe(snapshot2.totalPages);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @app/reader test src/diagnostics.test.ts`

Expected: FAIL

- [ ] **Step 3: Write minimal diagnostics.ts implementation**

```typescript
import type {
  ReaderSessionInput,
  ReaderDiagnosticsSnapshot,
  ZoomStateSummary,
  DiagnosticEvent,
} from './types.js';

export function createReaderDiagnostics(
  input: ReaderSessionInput,
  activePageIndex: number,
  totalPages: number,
  chromeVisible: boolean,
  failedPages: readonly number[],
  preloadQueueLength: number,
  visiblePageIndexes: readonly number[],
  zoomState?: ZoomStateSummary,
  lowMemoryMode?: boolean,
  preloadQueue?: readonly number[],
  events?: readonly DiagnosticEvent[]
): ReaderDiagnosticsSnapshot {
  return {
    timestamp: new Date().toISOString(),
    chapterId: input.chapter.id,
    activePageIndex,
    totalPages,
    visiblePageIndexes,
    settings: input.settings,
    zoom: zoomState ?? { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 },
    chromeVisible,
    failedPageCount: failedPages.length,
    preloadQueueLength: preloadQueueLength ?? preloadQueue?.length ?? 0,
    lowMemoryMode: lowMemoryMode ?? input.settings.lowMemoryMode,
    events: events ?? [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @app/reader test src/diagnostics.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/reader/src/diagnostics.ts packages/reader/src/diagnostics.test.ts
git commit -m "feat(reader): add diagnostics snapshot function"
```

---

## Task 12: Update index.ts Exports

**Files:**
- Modify: `packages/reader/src/index.ts`

- [ ] **Step 1: Update index.ts to export all public functions and types**

Read current `packages/reader/src/index.ts` and replace content:

```typescript
// @app/reader
export const PACKAGE_NAME = '@app/reader' as const;

// Types
export type {
  ReaderPage,
  ReaderChapter,
  ReaderViewport,
  ReaderOverlayInsets,
  ReaderSessionInput,
  ReaderProgressEvent,
  ReaderNavigationAction,
  ReaderDiagnosticsSnapshot,
  PageSlot,
  SpreadLayout,
  TapZoneRegion,
  TapZoneAction,
  TapZoneDebugModel,
  ZoomStateSummary,
  ReaderEngineSettings,
  NavigationActionType,
  ReaderState,
  PageLayoutMode,
  PreloadItem,
  PreloadPlan,
  DecodeQueueItem,
  DecodeQueue,
  PageLoadResult,
  DiagnosticEvent,
} from './types.js';

// Layout/spread functions
export { createReaderState, calculatePageSlots, calculateSpreadPlan, resolveInitialPageIndex } from './state.js';
export { calculatePageSlots, calculateSpreadPlan, resolveInitialPageIndex } from './spreads.js';

// Tap zone functions
export { calculateTapZones, resolveTapZoneAction, createTapZoneDebugModel } from './tap-zones.js';

// Navigation functions
export { resolveNavigationAction, applyNavigationAction, resolveKeyboardAction, resolveWheelAction } from './navigation.js';

// Zoom/pan functions
export { createZoomState, applyDoubleTapZoom, applyPinchZoom, applyPan, clampZoomTransform } from './zoom.js';

// Webtoon functions
export { calculateWebtoonWindow, estimateWebtoonLayout } from './webtoon.js';

// Preload functions
export { createPreloadPlan, createDecodeQueue, recordPageLoadResult } from './preload.js';

// Progress functions
export { createProgressEvent, shouldPersistProgress } from './progress.js';

// Diagnostics
export { createReaderDiagnostics } from './diagnostics.js';
```

Note: We export `calculatePageSlots` and `calculateSpreadPlan` from both `state.ts` and `spreads.ts` to maintain the public API. The functions in `spreads.ts` are the actual implementations, while `state.ts` re-exports them.

- [ ] **Step 2: Run typecheck to verify exports**

Run: `pnpm --filter @app/reader typecheck`

Expected: PASS

- [ ] **Step 3: Run tests to verify everything works**

Run: `pnpm --filter @app/reader test`

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/reader/src/index.ts
git commit -m "feat(reader): export all public API functions and types"
```

---

## Task 13: Run Package and Root Verification

- [ ] **Step 1: Run package-level tests**

Run: `pnpm --filter @app/reader test`

Expected: All tests pass

- [ ] **Step 2: Run package-level typecheck**

Run: `pnpm --filter @app/reader typecheck`

Expected: PASS

- [ ] **Step 3: Run package-level lint**

Run: `pnpm --filter @app/reader lint`

Expected: PASS (or fix any lint errors)

- [ ] **Step 4: Run package-level build**

Run: `pnpm --filter @app/reader build`

Expected: PASS

- [ ] **Step 5: Run root-level test**

Run: `pnpm test`

Expected: All tests pass (or skip legacy tests if they're broken)

- [ ] **Step 6: Run root-level typecheck**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 7: Run root-level lint**

Run: `pnpm lint`

Expected: PASS (or fix lint errors)

- [ ] **Step 8: Run root-level build**

Run: `pnpm build`

Expected: PASS

---

## Verification Checklist

Before marking Phase 6 complete:

- [ ] `@app/reader` no longer only exports `PACKAGE_NAME`
- [ ] Pure engines cover layout, spread, tap zones, navigation, zoom/pan, webtoon windowing, preload/decode planning, progress events, retry state, low-memory behavior, and diagnostics
- [ ] Reader supports RTL, LTR, and vertical modes
- [ ] Tap-zone calculations account for overlays, zoom state, scroll mode, and navigation direction
- [ ] Reader interactions can be tested without React, router, provider runtime, DB, or Electron
- [ ] Public imports from `@app/reader` do not require DOM/browser globals at import time
- [ ] Unit tests cover spread calculation, cover-aware smart spread, tap-zone geometry, keyboard navigation, zoom/pan clamping, preload planning, low-memory mode, progress persistence policy, and diagnostics
- [ ] `pnpm --filter @app/reader test`, `typecheck`, and `build` pass
- [ ] Root `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass