import { describe, expect, it } from 'vitest';
import { computeScrollTargetTop, resolveVerticalNavigationTarget } from './scroll-navigation.js';
import { computeScrollPageMetrics } from './scroll-layout.js';

describe('resolveVerticalNavigationTarget', () => {
  it('Given ArrowRight once from a short page, When resolved, Then the target advances exactly one', () => {
    expect(resolveVerticalNavigationTarget(10, { type: 'nextPage' }, 37)).toBe(11);
  });

  it('Given N rapid next actions, When each resolves from the previous target, Then N presses advance N', () => {
    let target = 10;
    for (let press = 0; press < 5; press += 1) {
      target = resolveVerticalNavigationTarget(target, { type: 'nextPage' }, 37);
    }

    expect(target).toBe(15);
  });

  it('Given Home, When resolved, Then the first page is the target', () => {
    expect(resolveVerticalNavigationTarget(20, { type: 'firstPage' }, 37)).toBe(0);
  });

  it('Given End, When resolved, Then the last page is the target', () => {
    expect(resolveVerticalNavigationTarget(3, { type: 'lastPage' }, 37)).toBe(36);
  });

  it('Given next at the last page, When resolved, Then the target stays on the last page', () => {
    expect(resolveVerticalNavigationTarget(36, { type: 'nextPage' }, 37)).toBe(36);
  });

  it('Given prev at the first page, When resolved, Then the target stays on the first page', () => {
    expect(resolveVerticalNavigationTarget(0, { type: 'prevPage' }, 37)).toBe(0);
  });

  it('Given a chapter with no pages, When resolved, Then the target clamps to zero', () => {
    expect(resolveVerticalNavigationTarget(0, { type: 'lastPage' }, 0)).toBe(0);
  });
});

describe('computeScrollTargetTop', () => {
  const viewportHeight = 600;

  it('Given a page shorter than half the viewport, When scrolled to, Then its centre lands on the viewport centre', () => {
    // Page 0 is 900px, page 1 only 250px (< half the 600px viewport), and there
    // is a third page below so centring page 1 is reachable.
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 900 },
        { index: 1, height: 250 },
        { index: 2, height: 900 },
      ],
      0,
    );
    const top = computeScrollTargetTop(metrics, 1, viewportHeight, 2050);
    const centre = top + viewportHeight / 2;

    // Centring page 1 wants 900 + 125 - 300 = 725, inside [0, 1450].
    expect(top).toBe(725);
    expect(centre).toBe(1025);
    expect(centre).toBeGreaterThan(900);
    expect(centre).toBeLessThan(1150);
  });

  it('Given a short page with no room below, When scrolled to, Then the offset clamps to the scroll range', () => {
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 900 },
        { index: 1, height: 250 },
      ],
      0,
    );
    // Centring wants 725, past the 550 the document can scroll.
    const top = computeScrollTargetTop(metrics, 1, viewportHeight, 1150);

    expect(top).toBe(550);
    expect(top).toBeLessThanOrEqual(1150 - viewportHeight);
  });

  it('Given a page whose centre cannot be reached, When scrolled to, Then the offset clamps to the scroll range', () => {
    // Page 1 is only 100px tall and last, so centring it would need scrollTop
    // 650, beyond the 300px the document can scroll.
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 300 },
        { index: 1, height: 100 },
      ],
      0,
    );
    const top = computeScrollTargetTop(metrics, 1, viewportHeight, 400);

    expect(top).toBe(0);
  });

  it('Given a tall page, When scrolled to, Then the viewport centre sits inside that page', () => {
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 900 },
        { index: 1, height: 900 },
      ],
      0,
    );
    const top = computeScrollTargetTop(metrics, 1, viewportHeight, 1800);
    const centre = top + viewportHeight / 2;

    expect(centre).toBeGreaterThanOrEqual(900);
    expect(centre).toBeLessThan(1800);
  });

  it('Given the last page, When scrolled to, Then the offset never exceeds the scrollable range', () => {
    const metrics = computeScrollPageMetrics(
      [
        { index: 0, height: 900 },
        { index: 1, height: 900 },
        { index: 2, height: 900 },
      ],
      0,
    );
    const top = computeScrollTargetTop(metrics, 2, viewportHeight, 2700);

    expect(top).toBeLessThanOrEqual(2700 - viewportHeight);
  });

  it('Given an index with no metrics, When scrolled to, Then the offset falls back to the top', () => {
    const metrics = computeScrollPageMetrics([{ index: 0, height: 900 }], 0);

    expect(computeScrollTargetTop(metrics, 9, viewportHeight, 900)).toBe(0);
  });
});
