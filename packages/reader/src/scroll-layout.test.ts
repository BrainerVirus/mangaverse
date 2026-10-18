import { describe, expect, it } from 'vitest';
import {
  computeScrollPageMetrics,
  findActiveScrollPage,
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
