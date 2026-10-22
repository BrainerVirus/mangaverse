export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

export interface TapRecord extends PointerPoint {
  readonly time: number;
}

export interface PinchBaseline {
  readonly scale: number;
  readonly distance: number;
}

/** Two taps inside this window, this close together, are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 30;
/** Pointer travel past this many pixels is a pan, not a tap. */
const PAN_THRESHOLD_PX = 6;

export const GESTURE_SENSITIVITY_MIN = 0.25;
export const GESTURE_SENSITIVITY_MAX = 4;

export function clampGestureSensitivity(sensitivity: number): number {
  if (!Number.isFinite(sensitivity)) return 1;
  return Math.min(GESTURE_SENSITIVITY_MAX, Math.max(GESTURE_SENSITIVITY_MIN, sensitivity));
}

/**
 * One multiplier drives every touch threshold: higher sensitivity accepts a
 * slower, looser double tap and starts panning after less travel.
 */
export function resolveGestureThresholds(sensitivity = 1): {
  readonly doubleTapMs: number;
  readonly doubleTapSlopPx: number;
  readonly panThresholdPx: number;
} {
  const factor = clampGestureSensitivity(sensitivity);
  return {
    doubleTapMs: Math.round(DOUBLE_TAP_MS * factor),
    doubleTapSlopPx: Math.round(DOUBLE_TAP_SLOP_PX * factor),
    panThresholdPx: PAN_THRESHOLD_PX / factor,
  };
}

export function pointerDistance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isDoubleTap(previous: TapRecord | null, next: TapRecord, sensitivity = 1): boolean {
  if (previous === null) return false;
  const thresholds = resolveGestureThresholds(sensitivity);
  return (
    next.time - previous.time <= thresholds.doubleTapMs &&
    pointerDistance(previous, next) <= thresholds.doubleTapSlopPx
  );
}

/** Scale a pinch produces at `distance` from the baseline separation. */
export function pinchScale(baseline: PinchBaseline, distance: number, sensitivity = 1): number {
  if (baseline.distance <= 0 || distance <= 0) return baseline.scale;
  const factor = clampGestureSensitivity(sensitivity);
  const ratio = 1 + (distance / baseline.distance - 1) * factor;
  return baseline.scale * Math.max(0.1, ratio);
}
