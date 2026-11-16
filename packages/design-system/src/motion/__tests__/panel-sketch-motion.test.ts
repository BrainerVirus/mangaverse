import { afterEach, describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import {
  PANEL_SKETCH_TIMING,
  panelSketchDissolve,
  panelSketchDraw,
  panelSketchParts,
  type PanelSketchParts,
} from '../reader-safe/panel-sketch.js';

function build(): { root: HTMLElement; parts: PanelSketchParts } {
  document.body.innerHTML = `
    <div data-root>
      <svg><g data-sketch-drawing>
        <path data-sketch-tone d="M0 0 L1 0 L1 1 Z"></path>
        <path data-sketch-stroke pathLength="1" d="M0 0 L1 0 L1 1 Z"></path>
        <path data-sketch-stroke pathLength="1" d="M0 0 L1 0 L1 1 Z"></path>
        <path data-sketch-stroke pathLength="1" d="M0 0 L1 0 L1 1 Z"></path>
      </g></svg>
    </div>`;
  const root = document.querySelector<HTMLElement>('[data-root]')!;
  const parts = panelSketchParts(root);
  if (parts === null) throw new Error('no sketch parts');
  return { root, parts };
}

const offset = (element: Element) => Number(gsap.getProperty(element, 'strokeDashoffset'));
const opacity = (element: Element) => Number(gsap.getProperty(element, 'opacity'));

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.innerHTML = '';
});

describe('panelSketchDraw', () => {
  it('Given motion, Then the borders draw one after another, the tone follows, and the cycle loops', () => {
    const { parts } = build();
    const timeline = panelSketchDraw(parts, { reducedMotion: false, animate: true });
    if (timeline === null) throw new Error('expected a timeline');
    timeline.pause();
    expect(timeline.repeat()).toBe(-1);
    expect(timeline.repeatDelay()).toBe(PANEL_SKETCH_TIMING.pause);

    timeline.time(0.001);
    expect(parts.strokes.map(offset).every((value) => value > 0.99)).toBe(true);
    expect(opacity(parts.tones[0]!)).toBe(0);

    // Mid-way: the first border is closed while the last has not started.
    timeline.time(PANEL_SKETCH_TIMING.stroke);
    expect(offset(parts.strokes[0]!)).toBe(0);
    expect(offset(parts.strokes[2]!)).toBeGreaterThan(0.9);

    const drawn = PANEL_SKETCH_TIMING.stroke + PANEL_SKETCH_TIMING.strokeStagger * 2;
    timeline.time(drawn + PANEL_SKETCH_TIMING.tone + 0.01);
    expect(parts.strokes.map(offset)).toEqual([0, 0, 0]);
    expect(opacity(parts.tones[0]!)).toBe(1);

    // The finished page lifts before the next cycle.
    timeline.time(timeline.duration());
    expect(opacity(parts.drawing)).toBe(0);
  });

  it('Given a shared clock, Then a remounted sketch picks up where the cycle is', () => {
    const { parts } = build();
    const first = panelSketchDraw(parts, { reducedMotion: false, animate: true, clock: 1.2 })!;
    expect(first.totalTime()).toBeCloseTo(1.2, 5);
    const cycle = first.duration() + PANEL_SKETCH_TIMING.pause;
    const later = panelSketchDraw(parts, {
      reducedMotion: false,
      animate: true,
      clock: cycle * 3 + 1.2,
    })!;
    expect(later.totalTime()).toBeCloseTo(1.2, 5);
  });

  it.each([
    ['reduced motion', { reducedMotion: true, animate: true }],
    ['off screen', { reducedMotion: false, animate: false }],
  ] as const)('Given %s, Then the finished drawing holds still', (_case, options) => {
    const { parts } = build();
    expect(panelSketchDraw(parts, options)).toBeNull();
    for (const stroke of parts.strokes) {
      expect((stroke as SVGElement).style.strokeDashoffset).toBe('');
    }
    expect(gsap.globalTimeline.getChildren().length).toBe(0);
  });
});

describe('panelSketchDissolve', () => {
  it('Given motion, Then the drawing fades out over the real page', () => {
    const { root } = build();
    const tween = panelSketchDissolve(root, { reducedMotion: false });
    expect(tween.duration()).toBe(PANEL_SKETCH_TIMING.dissolve);
    tween.progress(1);
    expect(root.style.opacity).toBe('0');
    expect(root.style.visibility).toBe('hidden');
  });

  it('Given reduced motion, Then the drawing is gone at once', () => {
    const { root } = build();
    const tween = panelSketchDissolve(root, { reducedMotion: true });
    expect(tween.duration()).toBe(0);
    expect(root.style.visibility).toBe('hidden');
  });
});
