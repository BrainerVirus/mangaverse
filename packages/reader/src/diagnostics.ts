import type {
  ReaderSessionInput,
  ZoomStateSummary,
  DiagnosticEvent,
  ReaderDiagnosticsSnapshot,
} from './types';

export function createReaderDiagnostics(
  input: ReaderSessionInput,
  activePageIndex: number,
  totalPages: number,
  chromeVisible: boolean,
  failedPages: readonly number[],
  _preloadPageIndex: number,
  visiblePageIndexes: readonly number[],
  zoom?: ZoomStateSummary,
  _preloadQueueLength?: number,
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
    zoom: zoom ?? { scale: 1, translateX: 0, translateY: 0, minZoom: input.settings.minZoom, maxZoom: input.settings.maxZoom },
    chromeVisible,
    failedPageCount: failedPages.length,
    preloadQueueLength: preloadQueue?.length ?? 0,
    lowMemoryMode: input.settings.lowMemoryMode,
    events: events ?? [],
  };
}