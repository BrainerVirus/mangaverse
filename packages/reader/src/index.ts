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

// Error validation
export { createReaderError, validateReaderSessionInput, validatePageIndex } from './errors.js';