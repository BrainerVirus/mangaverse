import { describe, expect, it } from 'vitest';
import { pageScreenBounds, screenSpan } from './use-scroll-activity';

const TILE = 4096;
/** Page 0 is 30,000px tall, then a 2,000px gap, then a 900px page. */
const metrics = [
  { index: 0, top: 0, height: 30_000 },
  { index: 1, top: 32_000, height: 900 },
];
const heights = [30_000, 900];

describe('screenSpan', () => {
  it('Given the viewport inside a tall page, Then the span names that page and snaps to its tiles', () => {
    expect(screenSpan(metrics, heights, 5_000, 800, TILE)).toEqual({
      start: 0,
      end: 0,
      startFrom: 4096,
      endTo: 8192,
    });
  });

  it('Given the viewport in the gap between pages, Then nothing is on screen', () => {
    expect(screenSpan(metrics, heights, 30_500, 800, TILE)).toBeNull();
  });

  it('Given the viewport across the gap, Then both pages are on screen with their own bounds', () => {
    const span = screenSpan(metrics, heights, 29_900, 2_500, TILE);
    expect(span).toEqual({ start: 0, end: 1, startFrom: 28_672, endTo: 4096 });
    expect(pageScreenBounds(span, 0)).toEqual({ from: 28_672, to: Number.POSITIVE_INFINITY });
    expect(pageScreenBounds(span, 1)).toEqual({ from: 0, to: 4096 });
  });

  it('Given a scroll within one tile, Then the span does not change, so nothing re-renders', () => {
    expect(screenSpan(metrics, heights, 4_200, 800, TILE)).toEqual(
      screenSpan(metrics, heights, 4_900, 800, TILE),
    );
  });
});

describe('pageScreenBounds', () => {
  it('Given an empty span or a page outside it, Then the page shows nothing', () => {
    expect(pageScreenBounds(null, 0)).toEqual({ from: 0, to: 0 });
    expect(pageScreenBounds({ start: 2, end: 3, startFrom: 0, endTo: 4096 }, 0)).toEqual({
      from: 0,
      to: 0,
    });
  });

  it('Given pages between the first and last on screen, Then they show whole', () => {
    expect(pageScreenBounds({ start: 0, end: 2, startFrom: 4096, endTo: 4096 }, 1)).toEqual({
      from: 0,
      to: Number.POSITIVE_INFINITY,
    });
  });
});
