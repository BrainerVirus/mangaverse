import { describe, expect, it } from 'vitest';
import { calculateTapZones } from './tap-zones.js';
import type { ReaderSessionInput } from './types.js';

const sessionInput: ReaderSessionInput = {
  chapter: {
    id: 'chapter-1',
    mangaId: 'manga-1',
    title: 'Chapter 1',
    pageCount: 2,
    pages: [
      { id: 'page-1', index: 0, image: { url: 'https://example.com/1.jpg' } },
      { id: 'page-2', index: 1, image: { url: 'https://example.com/2.jpg' } },
    ],
  },
  viewport: { width: 900, height: 600, orientation: 'landscape' },
  settings: {
    readingMode: 'ltr',
    pageLayout: 'single',
    tapZoneLayout: 'leftRight',
    navigationDirection: 'default',
    tapZoneDebugOverlay: false,
    minZoom: 1,
    maxZoom: 3,
    doubleTapZoom: 1.5,
    gestureSensitivity: 1,
    treatFirstPageAsCover: true,
    preloadAhead: 2,
    lowMemoryMode: false,
    wheelBehavior: 'scroll',
    verticalGapPx: 8,
  },
};

function findTapZone(
  zones: ReturnType<typeof calculateTapZones>,
  x: number,
  y: number,
) {
  return zones.find(
    (zone) =>
      zone.width > 0 &&
      zone.height > 0 &&
      x >= zone.x &&
      x < zone.x + zone.width &&
      y >= zone.y &&
      y < zone.y + zone.height,
  );
}

describe('reader tap zone hit testing', () => {
  it('maps right-side taps to next page in ltr mode', () => {
    const zones = calculateTapZones(sessionInput, { top: 96, right: 0, bottom: 48, left: 0 });
    const zone = findTapZone(zones, 800, 300);

    expect(zone?.id).toBe('right');
    expect(zone?.action).toEqual({ type: 'nextPage' });
  });

  it('maps left-side taps to previous page in ltr mode', () => {
    const zones = calculateTapZones(sessionInput, { top: 96, right: 0, bottom: 48, left: 0 });
    const zone = findTapZone(zones, 100, 300);

    expect(zone?.id).toBe('left');
    expect(zone?.action).toEqual({ type: 'prevPage' });
  });
});
