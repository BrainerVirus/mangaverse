import { describe, it, expect } from 'vitest';
import { createReaderDiagnostics } from './diagnostics';
import type { ReaderSessionInput, ZoomStateSummary, DiagnosticEvent } from './types';

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
    chapter: mockChapter as any,
    viewport: mockViewport,
    settings: defaultSettings as any,
  };
}

describe('createReaderDiagnostics', () => {
  it('should create snapshot with timestamp', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 1, false, [], 0, [0]);

    expect(snapshot.timestamp).toBeDefined();
  });

  it('should include chapter id', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 1, false, [], 0, [0]);

    expect(snapshot.chapterId).toBe('ch1');
  });

  it('should include page information', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 1, 3, false, [], 0, [1]);

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
    const zoom: ZoomStateSummary = { scale: 1.5, translateX: 10, translateY: 20, minZoom: 1, maxZoom: 3 };
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
    const events: DiagnosticEvent[] = [
      { type: 'pageLoaded', timestamp: new Date().toISOString(), data: { pageIndex: 1 } },
      { type: 'zoomChanged', timestamp: new Date().toISOString(), data: { scale: 1.5 } },
    ];
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0], undefined, undefined, undefined, events);

    expect(snapshot.events).toHaveLength(2);
  });

  it('should not include secrets in snapshot', () => {
    const input = makeInput();
    const snapshot = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);

    const snapshotStr = JSON.stringify(snapshot);
    expect(snapshotStr).not.toContain('example.com');
  });

  it('should produce deterministic snapshots for same input', () => {
    const input = makeInput();
    const snapshot1 = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);
    const snapshot2 = createReaderDiagnostics(input, 0, 3, false, [], 0, [0]);

    expect(snapshot1.activePageIndex).toBe(snapshot2.activePageIndex);
    expect(snapshot1.totalPages).toBe(snapshot2.totalPages);
  });
});