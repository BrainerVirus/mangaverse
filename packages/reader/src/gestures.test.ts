import { describe, expect, it } from 'vitest';
import { isDoubleTap, pinchScale, resolveGestureThresholds, type TapRecord } from './gestures.js';

const tap = (time: number, x = 10, y = 10): TapRecord => ({ time, x, y });

describe('resolveGestureThresholds', () => {
  it('Given higher sensitivity, When comparing thresholds, Then taps are more forgiving and pan starts sooner', () => {
    const normal = resolveGestureThresholds(1);
    const high = resolveGestureThresholds(2);
    expect(high.doubleTapMs).toBeGreaterThan(normal.doubleTapMs);
    expect(high.doubleTapSlopPx).toBeGreaterThan(normal.doubleTapSlopPx);
    expect(high.panThresholdPx).toBeLessThan(normal.panThresholdPx);
  });

  it('Given absurd values, When resolving thresholds, Then they stay inside the sane range', () => {
    expect(resolveGestureThresholds(100).doubleTapMs).toBe(resolveGestureThresholds(4).doubleTapMs);
    expect(resolveGestureThresholds(-5).doubleTapMs).toBe(
      resolveGestureThresholds(0.25).doubleTapMs,
    );
    expect(resolveGestureThresholds(Number.NaN).doubleTapMs).toBe(300);
  });
});

describe('isDoubleTap', () => {
  it('Given the configured sensitivity, When a slow tap arrives, Then only the sensitive setting accepts it', () => {
    const previous = tap(0);
    const next = tap(500);
    expect(isDoubleTap(previous, next, 1)).toBe(false);
    expect(isDoubleTap(previous, next, 2)).toBe(true);
  });

  it('Given two nearby taps, When they are close in time and space, Then it is a double tap', () => {
    expect(isDoubleTap(tap(0), tap(120, 14, 14), 1)).toBe(true);
  });

  it('Given a first tap, When the next tap is far away, Then it is not a double tap', () => {
    expect(isDoubleTap(tap(0), tap(120, 200, 200), 1)).toBe(false);
  });
});

describe('pinchScale', () => {
  const baseline = { scale: 1, distance: 100 };

  it('Given the default sensitivity, When the fingers double their separation, Then the scale doubles', () => {
    expect(pinchScale(baseline, 200, 1)).toBe(2);
  });

  it('Given higher sensitivity, When the pinch distance changes, Then the zoom changes faster', () => {
    expect(pinchScale(baseline, 120, 2)).toBeCloseTo(1.4);
    expect(pinchScale(baseline, 120, 1)).toBeCloseTo(1.2);
  });

  it('Given a collapsing pinch, When sensitivity is high, Then the scale never reaches zero', () => {
    expect(pinchScale(baseline, 1, 4)).toBeGreaterThan(0);
  });
});
