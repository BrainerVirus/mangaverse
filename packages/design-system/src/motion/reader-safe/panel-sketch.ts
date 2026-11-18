import { gsap } from 'gsap';

/**
 * The page-placeholder sketch's timing, in seconds. One cycle draws every
 * panel border in turn, lays the screentone in, holds the finished page, then
 * lifts it and starts over.
 */
export const PANEL_SKETCH_TIMING = {
  /** One border, from first touch to closed outline. */
  stroke: 0.7,
  /** Between one border starting and the next. */
  strokeStagger: 0.32,
  tone: 0.6,
  toneStagger: 0.2,
  /** The finished drawing rests this long before it lifts. */
  hold: 1.4,
  lift: 0.45,
  /** Blank page between cycles. */
  pause: 0.5,
  /** The real page arriving: the drawing dissolves into it. */
  dissolve: 0.24,
} as const;

/** Parts of a rendered sketch, found by their data attributes. */
export interface PanelSketchParts {
  /** Panel borders; each path carries `pathLength="1"` so a dash of 1 is its whole length. */
  readonly strokes: readonly Element[];
  readonly tones: readonly Element[];
  /** Everything that lifts between cycles. */
  readonly drawing: Element;
}

export function panelSketchParts(root: Element): PanelSketchParts | null {
  const drawing = root.querySelector('[data-sketch-drawing]');
  if (drawing === null) return null;
  return {
    drawing,
    strokes: [...root.querySelectorAll('[data-sketch-stroke]')],
    tones: [...root.querySelectorAll('[data-sketch-tone]')],
  };
}

export interface PanelSketchDrawOptions {
  readonly reducedMotion: boolean;
  /** Off screen the sketch holds still; only placeholders the reader can see draw. */
  readonly animate: boolean;
  /**
   * Seconds on a shared clock. Starting every loop at the clock's place in the
   * cycle keeps a sketch continuous when its placeholder remounts (the pending
   * stage handing over to the loaded one) and keeps a spread in step.
   */
  readonly clock?: number;
}

/**
 * Draws the sketch in ink, panel by panel, then screentone, on a gentle loop.
 * With reduced motion, or off screen, it is the finished drawing and nothing
 * moves: the parts' resting styles are that drawing, so there is nothing to set.
 */
export function panelSketchDraw(
  parts: PanelSketchParts,
  { reducedMotion, animate, clock = 0 }: PanelSketchDrawOptions,
): gsap.core.Timeline | null {
  if (reducedMotion || !animate || parts.strokes.length === 0) return null;
  const t = PANEL_SKETCH_TIMING;
  const timeline = gsap.timeline({ repeat: -1, repeatDelay: t.pause });
  timeline
    .set(parts.drawing, { opacity: 1 })
    .set(parts.strokes, { strokeDasharray: 1, strokeDashoffset: 1 })
    .set(parts.tones, { opacity: 0 })
    .to(parts.strokes, {
      strokeDashoffset: 0,
      duration: t.stroke,
      ease: 'power1.inOut',
      stagger: t.strokeStagger,
    })
    .to(parts.tones, { opacity: 1, duration: t.tone, ease: 'power1.out', stagger: t.toneStagger })
    .to(parts.drawing, { opacity: 0, duration: t.lift, ease: 'power1.in' }, `+=${t.hold}`);
  const cycle = timeline.duration() + t.pause;
  timeline.totalTime(((clock % cycle) + cycle) % cycle);
  return timeline;
}

/**
 * The real page has arrived: the finished drawing fades out over it. Reduced
 * motion hides it at once.
 */
export function panelSketchDissolve(
  target: gsap.TweenTarget,
  { reducedMotion }: { readonly reducedMotion: boolean },
): gsap.core.Tween {
  if (reducedMotion) return gsap.set(target, { autoAlpha: 0 });
  return gsap.to(target, {
    autoAlpha: 0,
    duration: PANEL_SKETCH_TIMING.dissolve,
    ease: 'power1.out',
  });
}
