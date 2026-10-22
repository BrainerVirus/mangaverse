// @app/reader
export const PACKAGE_NAME = '@app/reader' as const;
export { READER_ERROR_CODES } from './types.js';

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
  PreloadRetryState,
  DecodeQueueItem,
  DecodeQueue,
  PageLoadResult,
  DiagnosticEvent,
} from './types.js';

// Layout/spread functions (from state.ts - includes createReaderState)
export { createReaderState } from './state.js';
// Spread calculation functions
export { calculatePageSlots, calculateSpreadPlan, resolveInitialPageIndex } from './spreads.js';

// Tap zone functions
export { calculateTapZones, resolveTapZoneAction, createTapZoneDebugModel } from './tap-zones.js';

// Navigation functions
export {
  resolveNavigationAction,
  applyNavigationAction,
  resolveKeyboardAction,
  resolveWheelAction,
} from './navigation.js';

// Zoom/pan functions
export {
  createZoomState,
  applyDoubleTapZoom,
  applyPinchZoom,
  applyPan,
  clampZoomScale,
  clampZoomTransform,
} from './zoom.js';

// Page fit + vertical scroll navigation
export { resolvePageFit } from './page-fit.js';
export type { PageFit, PageFitInput } from './page-fit.js';
export { computeScrollTargetTop, resolveVerticalNavigationTarget } from './scroll-navigation.js';
export {
  isDoubleTap,
  pinchScale,
  pointerDistance,
  resolveGestureThresholds,
  clampGestureSensitivity,
  GESTURE_SENSITIVITY_MAX,
  GESTURE_SENSITIVITY_MIN,
} from './gestures.js';
export {
  isLongStripPage,
  resolveScrollPreloadAhead,
  LONG_STRIP_ASPECT_RATIO,
} from './scroll-layout.js';

// Webtoon functions
export { calculateWebtoonWindow, estimateWebtoonLayout } from './webtoon.js';

// Preload functions
export { createPreloadPlan, createDecodeQueue, recordPageLoadResult } from './preload.js';

// Progress functions
export {
  createProgressEvent,
  shouldCheckpointOnUnmount,
  shouldPersistProgress,
} from './progress.js';

// Diagnostics
export { createReaderDiagnostics } from './diagnostics.js';
export {
  createReaderMetricsCollector,
  EMPTY_READER_METRICS,
  type ReaderMetricEvent,
  type ReaderMetricsCollector,
  type ReaderMetricsSnapshot,
} from './reader-metrics.js';

// Feature page integration
export { ReaderScreen, type ReaderScreenProps } from './components/ReaderScreen.js';
export { fetchReaderPage } from './fetch-reader-page.js';
export { mapChapterToReaderChapter } from './map-chapter.js';
export { buildProgressEvent, persistReaderProgress } from './persist-reader-progress.js';
export { readerQueryKeys } from './query-keys.js';
export { toReaderEngineSettings } from './to-reader-engine-settings.js';
export type { ReaderPageData } from './reader-page-data.js';
