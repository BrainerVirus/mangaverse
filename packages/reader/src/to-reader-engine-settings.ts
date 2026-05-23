import type { ReaderSettings } from '@app/shared';
import type { ReaderEngineSettings } from './types.js';

export function toReaderEngineSettings(settings: ReaderSettings): ReaderEngineSettings {
  return {
    readingMode: settings.readingMode,
    pageLayout: settings.pageLayout,
    tapZoneLayout: settings.tapZoneLayout,
    navigationDirection: settings.navigationDirection,
    tapZoneDebugOverlay: settings.tapZoneDebugOverlay,
    minZoom: settings.minZoom,
    maxZoom: settings.maxZoom,
    doubleTapZoom: settings.doubleTapZoom,
    gestureSensitivity: settings.gestureSensitivity,
    treatFirstPageAsCover: true,
    preloadAhead: settings.preloadAhead,
    lowMemoryMode: settings.lowMemoryMode,
    wheelBehavior: settings.wheelBehavior,
    verticalGapPx: settings.verticalGapPx,
  };
}
