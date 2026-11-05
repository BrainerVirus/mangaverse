import type { ReaderSettings } from '@app/shared';
import {
  resolveReaderPresentation,
  type ReaderPresentationInput,
} from './resolve-reader-settings.js';
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
    treatFirstPageAsCover: true,
    preloadAhead: settings.preloadAhead,
    preloadBehind: settings.preloadBehind,
    lowMemoryMode: settings.lowMemoryMode,
    wheelBehavior: settings.wheelBehavior,
    verticalGapPx: settings.verticalGapPx,
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
