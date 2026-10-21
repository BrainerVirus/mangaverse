/** The untransformed box the zoom transform clamps and anchors against. */
export interface ZoomBox {
  readonly width: number;
  readonly height: number;
  /** Viewport coordinates of the box's top-left, for pointer anchors. */
  readonly left: number;
  readonly top: number;
}

/**
 * The zoom layer is `absolute inset-0` in the reader surface, so the surface's
 * rect is the layer's layout box. The layer's own `getBoundingClientRect`
 * reports the transformed box instead (width * scale, offset by translate),
 * which the clamp would then scale a second time.
 */
export function measureZoomBox(surface: HTMLElement | null): ZoomBox | null {
  if (surface === null) return null;
  const rect = surface.getBoundingClientRect();
  return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
}
