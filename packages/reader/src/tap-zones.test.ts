import { describe, it, expect } from 'vitest';
import {
  calculateTapZones,
  resolveTapZoneAction,
  createTapZoneDebugModel,
} from './tap-zones';
import type { ReaderSessionInput, ZoomStateSummary } from './types';

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
    chapter: mockChapter as any,
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

    const leftZoneNoOverlay = insetsWithoutOverlay.find(z => z.id === 'left')!;
    const leftZoneWithOverlay = insetsWithOverlay.find(z => z.id === 'left')!;

    expect(leftZoneWithOverlay.width).toBeLessThan(leftZoneNoOverlay.width);
    expect(leftZoneWithOverlay.y).toBe(50);
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

    expect(leftZone.action.type).toBe('nextPage');
    expect(rightZone.action.type).toBe('prevPage');
  });

  it('should return toggleChrome action for center zone in grid layout', () => {
    const input = makeInput({ tapZoneLayout: 'grid' });
    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 });
    const centerZone = zones.find(z => z.id === 'center')!;

    expect(centerZone.action.type).toBe('toggleChrome');
  });

  it('should disable tap navigation when zoomed', () => {
    const input = makeInput();
    const zoomState: ZoomStateSummary = { scale: 2, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };

    const zones = calculateTapZones(input, { top: 0, right: 0, bottom: 0, left: 0 }, zoomState);

    for (const zone of zones) {
      if (zone.id !== 'center') {
        expect(zone.action.type).toBe('none');
      }
    }
  });
});

describe('resolveTapZoneAction', () => {
  it('should return prevPage for left zone tap', () => {
    const input = makeInput();
    const action = resolveTapZoneAction(input, { zoneId: 'left', pageIndex: 1 });

    expect(action.type).toBe('prevPage');
  });

  it('should return nextPage for right zone tap', () => {
    const input = makeInput();
    const action = resolveTapZoneAction(input, { zoneId: 'right', pageIndex: 1 });

    expect(action.type).toBe('nextPage');
  });

  it('should return toggleChrome for center zone in grid layout', () => {
    const input = makeInput({ tapZoneLayout: 'grid' });
    const action = resolveTapZoneAction(input, { zoneId: 'center', pageIndex: 1 });

    expect(action.type).toBe('toggleChrome');
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
    const zoomState: ZoomStateSummary = { scale: 1.5, translateX: 10, translateY: 20, minZoom: 1, maxZoom: 3 };
    const model = createTapZoneDebugModel(input, zones, zoomState);

    expect(model.zoomState.scale).toBe(1.5);
  });
});