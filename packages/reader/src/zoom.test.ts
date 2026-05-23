import { describe, it, expect } from 'vitest';
import {
  createZoomState,
  applyDoubleTapZoom,
  applyPinchZoom,
  applyPan,
  clampZoomTransform,
} from './zoom';
import type { ZoomStateSummary } from './types';

const defaultSettings = {
  minZoom: 1,
  maxZoom: 3,
  doubleTapZoom: 1.5,
  gestureSensitivity: 1,
};

describe('createZoomState', () => {
  it('should create initial zoom state at scale 1', () => {
    const state = createZoomState(defaultSettings);

    expect(state.scale).toBe(1);
    expect(state.translateX).toBe(0);
    expect(state.translateY).toBe(0);
    expect(state.minZoom).toBe(1);
    expect(state.maxZoom).toBe(3);
  });

  it('should respect min/max zoom from settings', () => {
    const state = createZoomState({ ...defaultSettings, minZoom: 0.5, maxZoom: 5 });

    expect(state.minZoom).toBe(0.5);
    expect(state.maxZoom).toBe(5);
  });
});

describe('applyDoubleTapZoom', () => {
  it('should zoom to doubleTapZoom level on double tap', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyDoubleTapZoom(state, { x: 400, y: 300 }, 800, 600, 1.5);

    expect(newState.scale).toBe(1.5);
  });

  it('should reset to base zoom when already at doubleTapZoom', () => {
    const state: ZoomStateSummary = { scale: 1.5, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyDoubleTapZoom(state, { x: 400, y: 300 }, 800, 600, 1.5);

    expect(newState.scale).toBe(1);
  });
});

describe('applyPinchZoom', () => {
  it('should scale zoom based on pinch delta', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 1, 1.5, { centerX: 400, centerY: 300 });

    expect(newState.scale).toBe(1.5);
  });

  it('should clamp zoom to maxZoom', () => {
    const state: ZoomStateSummary = { scale: 2.5, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 2.5, 5, { centerX: 400, centerY: 300 });

    expect(newState.scale).toBe(3);
  });

  it('should clamp zoom to minZoom', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPinchZoom(state, 1, 0.5, { centerX: 400, centerY: 300 });

    expect(newState.scale).toBe(1);
  });
});

describe('applyPan', () => {
  it('should apply pan delta to translation', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 0, translateY: 0, minZoom: 1, maxZoom: 3 };
    const newState = applyPan(state, 50, 30);

    expect(newState.translateX).toBe(50);
    expect(newState.translateY).toBe(30);
  });

  it('should accumulate pan deltas', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 10, translateY: 20, minZoom: 1, maxZoom: 3 };
    const newState = applyPan(state, 50, 30);

    expect(newState.translateX).toBe(60);
    expect(newState.translateY).toBe(50);
  });
});

describe('clampZoomTransform', () => {
  it('should keep translation within page bounds at scale 1', () => {
    const state: ZoomStateSummary = { scale: 1, translateX: 100, translateY: 100, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 800, 600);

    expect(clamped.translateX).toBe(0);
    expect(clamped.translateY).toBe(0);
  });

  it('should allow panning when zoomed in', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 100, translateY: 100, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 400, 300);

    expect(clamped.scale).toBe(2);
  });

  it('should clamp translation to prevent over-panning', () => {
    const state: ZoomStateSummary = { scale: 2, translateX: 500, translateY: 500, minZoom: 1, maxZoom: 3 };
    const clamped = clampZoomTransform(state, 800, 600, 400, 300);

    expect(clamped.translateX).toBeLessThanOrEqual(400);
    expect(clamped.translateY).toBeLessThanOrEqual(300);
  });
});