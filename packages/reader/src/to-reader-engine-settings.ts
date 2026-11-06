import type { ReaderSettings } from '@app/shared';
import {
  resolveReaderPresentation,
  type ReaderPresentationInput,
} from './resolve-reader-settings.js';
import { resolveDisplayMaxEdge } from './display-downscale.js';
import { resolveTilingThreshold } from './scroll-layout.js';
import type { ReaderEngineSettings } from './types.js';

/** What Auto resolves against besides the settings themselves. */
export type ReaderResolutionContext = Omit<ReaderPresentationInput, 'settings'>;

/**
 * The concrete values the reader layers consume. Saved settings may hold
 * `auto`; the engine never does.
 */
export function toReaderEngineSettings(
  settings: ReaderSettings,
  context: ReaderResolutionContext = {},
): ReaderEngineSettings {
  const presentation = resolveReaderPresentation({ ...context, settings });
  return {
    readingMode: presentation.readingMode,
    pageLayout: presentation.pageLayout,
    fitMode: presentation.fitMode,
    tapZoneLayout: settings.tapZoneLayout,
    navigationDirection: settings.navigationDirection,
    tapZoneDebugOverlay: settings.tapZoneDebugOverlay,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
    doubleTapZoom: settings.doubleTapZoom,
    gestureSensitivity: settings.gestureSensitivity,
    treatFirstPageAsCover: settings.spreadOffset === 0,
    widePageMode: settings.widePageMode,
    // Data saver loads only the page being read, so the session sees no window.
    preloadAhead: settings.dataSaver ? 0 : settings.preloadAhead,
    preloadBehind: settings.dataSaver ? 0 : settings.preloadBehind,
    tilingThresholdPx: resolveTilingThreshold(settings.tilingThreshold),
    displayMaxEdgePx: resolveDisplayMaxEdge(settings.displayDownscale),
    dataSaver: settings.dataSaver,
    lowMemoryMode: settings.lowMemoryMode,
    wheelBehavior: settings.wheelBehavior,
    verticalGapPx: settings.verticalGapPx,
    maxStripWidthPercent: settings.maxStripWidthPercent,
    nextChapterThresholdPercent: settings.nextChapterThresholdPercent,
    pageTransition: settings.pageTransition,
    pinchSensitivity: settings.pinchSensitivity,
    imageSmoothing: settings.imageSmoothing,
    keepScreenOn: settings.keepScreenOn,
    fullscreenOnOpen: settings.fullscreenOnOpen,
    longStripOptimization: settings.longStripOptimization,
    diagnosticsEnabled: settings.diagnosticsEnabled,
    keyboardShortcuts: settings.keyboardShortcuts,
  };
}
