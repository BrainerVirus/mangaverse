import { describe, expect, it } from 'vitest';
import {
  computeScrollPageMetrics,
  findActiveScrollPage,
  isLongStripPage,
  planPageTiles,
  resolveScrollPreloadAhead,
  resolveStripPageSize,
  stripPageHeight,
  STRIP_TILE_HEIGHT_PX,
  windowedScrollPages,
} from './scroll-layout.js';
import type { ReaderPage } from './types.js';

describe('computeScrollPageMetrics', () => {
  it('Given three pages of 100px with a 10px gap, When measured, Then offsets include the gaps', () => {
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 100 },
        { index: 1, height: 100 },
        { index: 2, height: 100 },
      ],
      10,
    );
    expect(metrics).toEqual([
      { index: 0, top: 0, height: 100 },
      { index: 1, top: 110, height: 100 },
      { index: 2, top: 220, height: 100 },
    ]);
  });

  it('Given a negative gap, When measured, Then the gap is clamped to zero', () => {
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 50 },
        { index: 1, height: 50 },
      ],
      -20,
    );
    expect(metrics[1]).toEqual({ index: 1, top: 50, height: 50 });
  });
});

describe('findActiveScrollPage', () => {
  const metrics = computeScrollPageMetrics(
    [
      { index: 0, height: 100 },
      { index: 1, height: 100 },
      { index: 2, height: 100 },
    ],
    10,
  );

  it('Given a center inside the second page, When resolved, Then the second page is active', () => {
    expect(findActiveScrollPage(metrics, 130)).toBe(1);
  });

  it('Given a center above the strip, When resolved, Then the first page is active', () => {
    expect(findActiveScrollPage(metrics, -50)).toBe(0);
  });

  it('Given a center beyond the strip, When resolved, Then the last page is active', () => {
    expect(findActiveScrollPage(metrics, 10_000)).toBe(2);
  });

  it('Given a center inside the gap after a page, When resolved, Then the following page is active', () => {
    // Gap after page 1 is [210, 220).
    expect(findActiveScrollPage(metrics, 215)).toBe(2);
  });

  it('Given mixed page heights, When resolved, Then the page whose body contains the center wins', () => {
    const mixed = computeScrollPageMetrics(
      [
        { index: 0, height: 300 },
        { index: 1, height: 40 },
        { index: 2, height: 900 },
      ],
      0,
    );
    expect(findActiveScrollPage(mixed, 340)).toBe(2);
    expect(findActiveScrollPage(mixed, 120)).toBe(0);
  });

  it('Given a center exactly on a page top, When resolved, Then that page is active', () => {
    expect(findActiveScrollPage(metrics, 110)).toBe(1);
  });

  it('Given an empty strip, When resolved, Then index 0 is returned', () => {
    expect(findActiveScrollPage([], 500)).toBe(0);
  });
});

describe('windowedScrollPages', () => {
  const pages = Array.from({ length: 10 }, (_value, index) => ({ index }) as ReaderPage);

  it('Given an active page mid-strip, When windowed, Then only the radius around it mounts', () => {
    expect([...windowedScrollPages(pages, 5, 2)].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
  });

  it('Given an active page at the start, When windowed, Then the window clamps to the first page', () => {
    expect([...windowedScrollPages(pages, 0, 2)].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('Given an active page at the end, When windowed, Then the window clamps to the last page', () => {
    expect([...windowedScrollPages(pages, 9, 2)].sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });
});

describe('long-strip optimization', () => {
  const tallPage = {
    index: 0,
    image: { url: 'https://example.com/tall.jpg', width: 800, height: 6000 },
  } as ReaderPage;
  const ordinaryPage = {
    index: 1,
    image: { url: 'https://example.com/page.jpg', width: 800, height: 1200 },
  } as ReaderPage;

  it('Given a 7.5:1 page, When classified, Then it is a long strip', () => {
    expect(isLongStripPage(tallPage)).toBe(true);
    expect(isLongStripPage(ordinaryPage)).toBe(false);
    expect(isLongStripPage({ index: 2, image: { url: 'x' } } as ReaderPage)).toBe(false);
  });

  it('Given a tall chapter with optimization on, When resolving preload, Then look-ahead drops to one page', () => {
    expect(
      resolveScrollPreloadAhead({
        pages: [tallPage, ordinaryPage],
        preloadAhead: 8,
        longStripOptimization: true,
      }),
    ).toBe(1);
  });

  it('Given ordinary pages, When resolving preload, Then the configured amount is kept', () => {
    expect(
      resolveScrollPreloadAhead({
        pages: [ordinaryPage],
        preloadAhead: 4,
        longStripOptimization: true,
      }),
    ).toBe(4);
    expect(
      resolveScrollPreloadAhead({
        pages: [tallPage],
        preloadAhead: 4,
        longStripOptimization: false,
      }),
    ).toBe(4);
  });

  it('Given low-memory mode already caps preload, When a tall chapter is optimized, Then it never grows', () => {
    expect(
      resolveScrollPreloadAhead({
        pages: [tallPage],
        preloadAhead: 0,
        lowMemoryMode: true,
        longStripOptimization: true,
      }),
    ).toBe(0);
  });
});

describe('strip page geometry', () => {
  const landscape = {
    index: 0,
    image: { url: 'https://example.com/landscape.jpg', width: 1600, height: 900 },
  } as ReaderPage;
  const unknown = { index: 1, image: { url: 'https://example.com/x.jpg' } } as ReaderPage;

  it('Given provider dimensions, When sized, Then the strip keeps the page ratio', () => {
    expect(resolveStripPageSize(landscape)).toMatchObject({ width: 1600, height: 900 });
    expect(stripPageHeight(landscape, 800)).toBe(450);
  });

  it('Given no dimensions, When sized, Then the 2:3 placeholder is used until a natural size arrives', () => {
    expect(stripPageHeight(unknown, 800)).toBe(1200);
    expect(stripPageHeight(unknown, 800, { width: 800, height: 400 })).toBe(400);
  });

  it('Given a zero-width strip before layout, When sized, Then the height never collapses to zero', () => {
    expect(stripPageHeight(landscape, 0)).toBe(1);
  });
});

describe('planPageTiles', () => {
  it('Given an ordinary page, When planned, Then it stays one tile', () => {
    expect(planPageTiles(1200)).toEqual([{ offset: 0, height: 1200 }]);
  });

  it('Given a page past the tiling threshold, When planned, Then tiles are contiguous and cover the page', () => {
    const height = 20_000;
    const tiles = planPageTiles(height);

    expect(tiles.length).toBe(Math.ceil(height / STRIP_TILE_HEIGHT_PX));
    expect(tiles[0]).toEqual({ offset: 0, height: STRIP_TILE_HEIGHT_PX });
    for (let index = 1; index < tiles.length; index += 1) {
      expect(tiles[index]!.offset).toBe(tiles[index - 1]!.offset + tiles[index - 1]!.height);
    }
    const last = tiles.at(-1)!;
    expect(last.offset + last.height).toBe(height);
  });

  it('Given a height exactly at the threshold, When planned, Then it is not tiled yet', () => {
    expect(planPageTiles(8192)).toHaveLength(1);
    expect(planPageTiles(8193)).toHaveLength(3);
  });

  it('Given a zero or negative height, When planned, Then one minimal tile is returned', () => {
    expect(planPageTiles(0)).toEqual([{ offset: 0, height: 1 }]);
    expect(planPageTiles(-5)).toEqual([{ offset: 0, height: 1 }]);
  });
});
