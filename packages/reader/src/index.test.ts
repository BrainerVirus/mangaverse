import { describe, it, expect } from 'vitest';
import {
  PACKAGE_NAME,
  READER_ERROR_CODES,
  // Types
  type ReaderPage,
  type ReaderChapter,
  type ReaderViewport,
  type ReaderOverlayInsets,
  type ReaderSessionInput,
  type ReaderProgressEvent,
  type ReaderNavigationAction,
  type ReaderDiagnosticsSnapshot,
  type PreloadRetryState,
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

  it('should export READER_ERROR_CODES as runtime constant', () => {
    expect(READER_ERROR_CODES).toBeDefined();
    expect(typeof READER_ERROR_CODES).toBe('object');
    expect(READER_ERROR_CODES.INPUT_INVALID).toBe('reader.input.invalid');
    expect(READER_ERROR_CODES.PAGE_MISSING).toBe('reader.page.missing');
    expect(READER_ERROR_CODES.LAYOUT_INVALID).toBe('reader.layout.invalid');
    expect(READER_ERROR_CODES.NAVIGATION_INVALID).toBe('reader.navigation.invalid');
    expect(READER_ERROR_CODES.IMAGE_FAILED).toBe('reader.image.failed');
    expect(READER_ERROR_CODES.PRELOAD_FAILED).toBe('reader.preload.failed');
  });

  it('should export all public types', () => {
    const _page: ReaderPage = {} as any;
    const _chapter: ReaderChapter = {} as any;
    const _viewport: ReaderViewport = {} as any;
    const _input: ReaderSessionInput = {} as any;
    const _event: ReaderProgressEvent = {} as any;
    const _action: ReaderNavigationAction = {} as any;
    const _snapshot: ReaderDiagnosticsSnapshot = {} as any;
    const _retryState: PreloadRetryState = {} as any;
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