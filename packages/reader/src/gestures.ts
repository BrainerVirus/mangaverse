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
export const PAN_THRESHOLD_PX = 6;

export function pointerDistance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isDoubleTap(previous: TapRecord | null, next: TapRecord): boolean {
  if (previous === null) return false;
  return (
    next.time - previous.time <= DOUBLE_TAP_MS &&
    pointerDistance(previous, next) <= DOUBLE_TAP_SLOP_PX
  );
}

/** Scale a pinch produces at `distance` from the baseline separation. */
export function pinchScale(baseline: PinchBaseline, distance: number): number {
  if (baseline.distance <= 0 || distance <= 0) return baseline.scale;
  return baseline.scale * (distance / baseline.distance);
}
