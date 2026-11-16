import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { gsap } from 'gsap';
import { PanelSketch } from '../components/panel-sketch.js';
import { setInAppReducedMotionPreference } from '../motion/utils/reduced-motion-preference.js';

const root = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-panel-sketch]')!;

/** The loops running on the global timeline (one per animating sketch). */
const loops = () =>
  gsap.globalTimeline.getChildren(false, false, true).filter((t) => t.repeat() === -1);

describe('PanelSketch', () => {
  beforeEach(() => setInAppReducedMotionPreference(false));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    gsap.globalTimeline.clear();
    setInAppReducedMotionPreference(false);
  });

  it('Given a page box, Then a decorative ink layout fills it without taking pointer events', () => {
    const { container } = render(<PanelSketch seed="chapter-1:0" width={420} height={630} />);
    const sketch = root(container);
    expect(sketch.getAttribute('aria-hidden')).toBe('true');
    expect(sketch.className).toContain('pointer-events-none');
    expect(sketch.className).toContain('absolute inset-0');
    expect(sketch.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 420 630');
    const strokes = sketch.querySelectorAll('[data-sketch-stroke]');
    expect(strokes.length).toBeGreaterThanOrEqual(3);
    for (const stroke of strokes) {
      expect(stroke.getAttribute('pathLength')).toBe('1');
      expect(stroke.getAttribute('class')).toContain('stroke-stage-ink/');
    }
    expect(sketch.querySelectorAll('[data-sketch-tone]').length).toBeGreaterThan(0);
    expect(sketch.querySelector('pattern circle')?.getAttribute('class')).toContain(
      'fill-stage-ink/',
    );
  });

  it('Given a visible pending page, Then it draws on a loop; held off screen, nothing runs', () => {
    const { rerender, container } = render(
      <PanelSketch seed="chapter-1:0" width={420} height={630} animate />,
    );
    expect(loops()).toHaveLength(1);
    expect(root(container).hasAttribute('data-sketch-animate')).toBe(true);

    rerender(<PanelSketch seed="chapter-1:0" width={420} height={630} animate={false} />);
    expect(loops()).toHaveLength(0);
    expect(root(container).hasAttribute('data-sketch-animate')).toBe(false);
  });

  it('Given reduced motion, Then the sketch is the finished drawing and nothing animates', () => {
    setInAppReducedMotionPreference(true);
    const { container } = render(
      <PanelSketch seed="chapter-1:0" width={420} height={630} animate />,
    );
    expect(loops()).toHaveLength(0);
    for (const stroke of container.querySelectorAll<SVGElement>('[data-sketch-stroke]')) {
      expect(stroke.style.strokeDasharray).toBe('');
    }
  });

  it('Given the page arrives, Then the drawing dissolves over it and stops drawing', () => {
    const { rerender, container } = render(
      <PanelSketch seed="chapter-1:0" width={420} height={630} animate />,
    );
    const to = vi.spyOn(gsap, 'to');
    rerender(<PanelSketch seed="chapter-1:0" width={420} height={630} animate revealed />);
    expect(loops()).toHaveLength(0);
    expect(to).toHaveBeenCalledWith(
      root(container),
      expect.objectContaining({ autoAlpha: 0, duration: 0.24 }),
    );
  });

  it('Given the page was already there on mount, Then there is no drawing to dissolve from', () => {
    const to = vi.spyOn(gsap, 'to');
    const { container } = render(
      <PanelSketch seed="chapter-1:0" width={420} height={630} animate revealed />,
    );
    expect(to).not.toHaveBeenCalled();
    expect(root(container).style.visibility).toBe('hidden');
  });

  it('Given a dissolving sketch, When the page box settles to the image shape, Then the dissolve runs on undisturbed', () => {
    const { rerender, container } = render(
      <PanelSketch seed="chapter-1:0" width={420} height={630} animate />,
    );
    rerender(<PanelSketch seed="chapter-1:0" width={420} height={630} animate revealed />);
    const to = vi.spyOn(gsap, 'to');
    const set = vi.spyOn(gsap, 'set');
    rerender(<PanelSketch seed="chapter-1:0" width={440} height={630} animate={false} revealed />);
    expect(to).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    gsap.globalTimeline.getChildren().forEach((child) => child.progress(1));
    expect(root(container).style.visibility).toBe('hidden');
  });
});
