import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gsap } from 'gsap';
import {
  createUpdatePillMotion,
  UPDATE_PILL_TIMING,
  type UpdatePillFrame,
  type UpdatePillMotion,
  type UpdatePillParts,
} from '../shell/update-pill.js';

const CIRCUMFERENCE = 2 * Math.PI * 14;

function build(): UpdatePillParts {
  document.body.innerHTML = `
    <div>
      <button data-pill>
        <span data-glow></span><span data-fill></span>
        <svg data-ring><circle data-arc stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0"></circle></svg>
        <span data-icon="download"></span><span data-icon="check"></span>
        <span data-icon="rotate"></span><span data-icon="clock"></span>
        <span data-label><span data-text class="t">Text<span data-dot>.</span><span data-dot>.</span><span data-dot>.</span></span></span>
      </button>
    </div>`;
  const q = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
  return {
    pill: q<HTMLElement>('[data-pill]'),
    glow: q<HTMLElement>('[data-glow]'),
    fill: q<HTMLElement>('[data-fill]'),
    ring: q('[data-ring]'),
    arc: q<SVGElement>('[data-arc]'),
    icons: {
      download: q<HTMLElement>('[data-icon="download"]'),
      check: q<HTMLElement>('[data-icon="check"]'),
      rotate: q<HTMLElement>('[data-icon="rotate"]'),
      clock: q<HTMLElement>('[data-icon="clock"]'),
    },
    labelSlot: q<HTMLElement>('[data-label]'),
    text: q<HTMLElement>('[data-text]'),
    dots: [...document.querySelectorAll<HTMLElement>('[data-dot]')],
  };
}

const downloading = (percent: number): UpdatePillFrame => ({
  kind: 'downloading',
  label: `${percent}%`,
  percent,
});
const ready: UpdatePillFrame = { kind: 'ready', label: 'Restart to update', percent: null };
const queued: UpdatePillFrame = { kind: 'queued', label: 'Restart queued', percent: null };
const restarting: UpdatePillFrame = { kind: 'restarting', label: 'Restarting…', percent: null };
const motion = { reducedMotion: false };
const reduced = { reducedMotion: true };

/** Run every finite tween to its end; infinite loops are left alone. */
function settle(): void {
  for (const child of gsap.globalTimeline.getChildren(true, true, true)) {
    if (child.repeat() !== -1 && child.parent === gsap.globalTimeline) child.progress(1);
  }
}

/** The text the label shows: React's text node, without the dots. */
const shown = (parts: UpdatePillParts) => parts.text.firstChild?.nodeValue;
const infinite = (target: gsap.TweenTarget) =>
  gsap.getTweensOf(target).filter((tween) => tween.repeat() === -1);

describe('update pill motion', () => {
  let parts: UpdatePillParts;
  let pill: UpdatePillMotion;

  beforeEach(() => {
    parts = build();
    pill = createUpdatePillMotion(parts);
  });

  afterEach(() => {
    pill.dispose();
    gsap.globalTimeline.clear();
    document.body.innerHTML = '';
  });

  it('Given the first frame, Then the pill slides in from the right and fades in', () => {
    pill.to(downloading(10), motion);
    const entrance = gsap.getTweensOf(parts.pill).find((tween) => tween.vars.x === 0);
    expect(entrance?.duration()).toBeCloseTo(UPDATE_PILL_TIMING.enter, 5);
    expect(gsap.getProperty(parts.pill, 'x')).toBeGreaterThan(0);
    expect(gsap.getProperty(parts.pill, 'opacity')).toBe(0);
    settle();
    expect(parts.pill.style.opacity).toBe('');
    expect(gsap.getProperty(parts.pill, 'x')).toBe(0);
  });

  it('Given the first frame is a download, Then the ring and its glyph show and the other glyphs rest hidden', () => {
    pill.to(downloading(10), motion);
    expect(parts.icons.download.style.opacity).toBe('1');
    expect(gsap.getProperty(parts.icons.download, 'scale')).toBeCloseTo(0.7, 5);
    expect(parts.icons.rotate.style.opacity).toBe('0');
    expect(parts.icons.clock.style.opacity).toBe('0');
    expect(parts.ring.getAttribute('style')).toContain('opacity: 1');
  });

  it('Given the first frame is ready, Then it also scales in with a small overshoot and pulses once', () => {
    pill.to(ready, motion);
    const scale = gsap.getTweensOf(parts.pill).find((tween) => tween.vars.scale === 1);
    expect(scale?.vars.ease).toBe('back.out(1.4)');
    expect(gsap.getTweensOf(parts.glow)).toHaveLength(1);
    expect(gsap.getTweensOf(parts.glow)[0]?.vars.opacity).toBe(0);
    expect(parts.icons.rotate.style.opacity).toBe('1');
  });

  it('Given download ticks, Then the number counts up and the arc moves on the same clock', () => {
    pill.to(downloading(40), motion);
    settle();
    parts.text.firstChild!.nodeValue = '70%'; // what React has just rendered
    pill.to(downloading(70), motion);

    // The old number stays until the count moves it.
    expect(shown(parts)).toBe('40%');
    const arcTween = gsap.getTweensOf(parts.arc!)[0]!;
    const counter = (gsap.globalTimeline.getChildren(false, true, false) as gsap.core.Tween[]).find(
      (tween) => typeof (tween.targets()[0] as { value?: unknown } | undefined)?.value === 'number',
    );
    expect(counter?.duration()).toBe(arcTween.duration());
    expect(counter?.vars.ease).toBe(arcTween.vars.ease);
    counter!.progress(0.5);
    const mid = Number(parts.text.firstChild!.nodeValue!.replace('%', ''));
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThanOrEqual(70);
    expect(Number.isInteger(mid)).toBe(true);
    settle();
    expect(shown(parts)).toBe('70%');
    expect(Number(parts.arc!.style.strokeDashoffset)).toBeCloseTo(CIRCUMFERENCE * 0.3, 3);
  });

  it('Given a phase change, Then the old label slides up and out while the new one slides up in', () => {
    pill.to(queued, motion);
    settle();
    parts.text.firstChild!.nodeValue = 'Restart to update';
    pill.to(ready, motion);
    const ghost = parts.labelSlot.querySelector<HTMLElement>('[data-pill-ghost]')!;
    expect(ghost.textContent).toBe('Restart queued');
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.parentElement).toBe(parts.labelSlot);
    expect(gsap.getProperty(parts.text, 'y')).toBeGreaterThan(0);
    expect(gsap.getProperty(parts.text, 'opacity')).toBe(0);
    const goingOut = gsap.getTweensOf(ghost)[0]!;
    expect(goingOut.vars.y).toBeLessThan(0);
    expect(goingOut.duration()).toBeLessThanOrEqual(0.4);
    settle();
    expect(parts.labelSlot.querySelector('[data-pill-ghost]')).toBeNull();
    expect(parts.text.style.opacity).toBe('1');
    expect(gsap.getProperty(parts.text, 'y')).toBe(0);
  });

  it('Given a phase change, Then the old glyph leaves and the new one comes in, each under 400ms', () => {
    pill.to(queued, motion);
    settle();
    pill.to(restarting, motion);
    for (const icon of [parts.icons.clock, parts.icons.rotate]) {
      for (const tween of gsap.getTweensOf(icon)) {
        expect(tween.duration()).toBeLessThanOrEqual(0.4);
      }
    }
    settle();
    expect(parts.icons.clock.style.opacity).toBe('0');
    expect(parts.icons.rotate.style.opacity).toBe('1');
  });

  describe('download complete', () => {
    beforeEach(() => {
      pill.to(downloading(80), motion);
      settle();
      parts.text.firstChild!.nodeValue = ready.label;
      pill.to(ready, motion);
    });

    it('Then one short timeline closes the ring, pops a check and turns it into the restart glyph', () => {
      const check = gsap.getTweensOf(parts.icons.check);
      expect(check.length).toBeGreaterThanOrEqual(2);
      const pop = check.find((tween) => tween.vars.scale === 1)!;
      expect(pop.duration()).toBeCloseTo(0.25, 5);
      const turn = check.find((tween) => tween.vars.rotation === 90)!;
      expect(turn.startTime()).toBeGreaterThan(pop.startTime());
      const arc = gsap.getTweensOf(parts.arc!)[0]!;
      expect(arc.vars.strokeDashoffset).toBeCloseTo(0, 5);
      const timeline = arc.parent as gsap.core.Timeline;
      // Everything but the soft glow pulse is done within the celebration's length.
      const glow = gsap.getTweensOf(parts.glow)[0]!;
      const others = timeline.getChildren(false, true, false).filter((child) => child !== glow);
      const end = Math.max(...others.map((child) => child.startTime() + child.duration()));
      expect(end).toBeGreaterThan(0.5);
      expect(end).toBeLessThanOrEqual(UPDATE_PILL_TIMING.celebrate + 0.01);
    });

    it('Then the old percent stays on show, counting to 100, until the label swaps', () => {
      const ghost = parts.labelSlot.querySelector<HTMLElement>('[data-pill-ghost]')!;
      expect(ghost.textContent).toBe('80%');
      expect(gsap.getProperty(parts.text, 'opacity')).toBe(0);
    });

    it('Then it ends on the restart glyph, the ring gone, the check gone, one glow pulse played', () => {
      expect(gsap.getTweensOf(parts.glow)).toHaveLength(1);
      settle();
      expect(parts.icons.rotate.style.opacity).toBe('1');
      expect(parts.icons.check.style.opacity).toBe('0');
      expect(parts.icons.download.style.opacity).toBe('0');
      expect(parts.ring.getAttribute('style')).toContain('opacity: 0');
      expect(shown(parts)).toBe('Restart to update');
      expect(parts.labelSlot.querySelector('[data-pill-ghost]')).toBeNull();
    });
  });

  it('Given a restart, Then the glyph spins without end and the dots fade in turn, until it moves on', () => {
    pill.to(ready, motion);
    settle();
    pill.to(restarting, motion);
    settle();
    const spin = infinite(parts.icons.rotate);
    expect(spin).toHaveLength(1);
    expect(spin[0]?.vars.rotation).toBe(360);
    expect(spin[0]?.vars.ease).toBe('none');
    expect(
      parts.dots.flatMap((dot) => infinite(dot).concat(gsap.getTweensOf(dot))),
    ).not.toHaveLength(0);
    pill.to(queued, motion);
    settle();
    expect(infinite(parts.icons.rotate)).toHaveLength(0);
  });

  it('Given the ready pill, Then hovering or focusing turns the glyph half a turn and leaving turns it back', () => {
    pill.to(ready, motion);
    settle();
    pill.hover(true, motion);
    const turn = gsap.getTweensOf(parts.icons.rotate).find((tween) => tween.vars.rotation === 180)!;
    expect(turn.duration()).toBeLessThanOrEqual(0.4);
    settle();
    expect(gsap.getProperty(parts.icons.rotate, 'rotation')).toBe(180);
    pill.hover(false, motion);
    settle();
    expect(gsap.getProperty(parts.icons.rotate, 'rotation')).toBe(0);
  });

  it('Given the ready pill, Then pressing scales it to 0.97 and releasing restores it', () => {
    pill.to(ready, motion);
    settle();
    pill.press(true, motion);
    settle();
    expect(gsap.getProperty(parts.pill, 'scale')).toBe(0.97);
    pill.press(false, motion);
    settle();
    expect(gsap.getProperty(parts.pill, 'scale')).toBe(1);
  });

  it('Given a pill that is not ready, Then hover and press do nothing', () => {
    pill.to(queued, motion);
    settle();
    pill.hover(true, motion);
    pill.press(true, motion);
    expect(gsap.getTweensOf(parts.icons.rotate)).toHaveLength(0);
    expect(gsap.getProperty(parts.pill, 'scale')).toBe(1);
  });

  it('Given the pill turns primary, Then the fill fades in over the old surface and ends clean', () => {
    pill.to(downloading(80), motion);
    settle();
    parts.text.firstChild!.nodeValue = ready.label;
    pill.to(ready, motion);
    const fade = gsap.getTweensOf(parts.fill).find((tween) => tween.vars.opacity === 1)!;
    expect(fade.startTime()).toBeGreaterThan(0.3);
    expect(fade.duration()).toBeLessThanOrEqual(0.4);
    settle();
    expect(parts.fill.style.opacity).toBe('0');
    expect(parts.pill.style.backgroundColor).toBe('');
  });

  describe('reduced motion', () => {
    it('Given any change, Then the end state is set at once and nothing is tweened', () => {
      pill.to(downloading(40), reduced);
      parts.text.firstChild!.nodeValue = ready.label;
      pill.to(ready, reduced);
      expect(parts.icons.rotate.style.opacity).toBe('1');
      expect(parts.icons.download.style.opacity).toBe('0');
      expect(parts.icons.check.style.opacity).toBe('0');
      expect(parts.ring.getAttribute('style')).toContain('opacity: 0');
      expect(shown(parts)).toBe('Restart to update');
      expect(parts.labelSlot.querySelector('[data-pill-ghost]')).toBeNull();
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
    });

    it('Given a restart, Then there is no spin and no dot loop', () => {
      pill.to(restarting, reduced);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
      expect(parts.icons.rotate.style.opacity).toBe('1');
    });

    it('Given hover and press, Then the glyph stays put and the pill does not scale', () => {
      pill.to(ready, reduced);
      pill.hover(true, reduced);
      pill.press(true, reduced);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
      expect(gsap.getProperty(parts.pill, 'scale')).toBe(1);
    });

    it('Given a download tick, Then the number and the arc jump to the new value', () => {
      pill.to(downloading(40), reduced);
      parts.text.firstChild!.nodeValue = '70%';
      pill.to(downloading(70), reduced);
      expect(shown(parts)).toBe('70%');
      expect(Number(parts.arc!.style.strokeDashoffset)).toBeCloseTo(CIRCUMFERENCE * 0.3, 3);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
    });
  });

  it('Given the pill is disposed, Then every loop and tween stops', () => {
    pill.to(restarting, motion);
    pill.dispose();
    expect(
      gsap.globalTimeline.getChildren(true, true, true).filter((c) => c.repeat() === -1),
    ).toHaveLength(0);
  });

  it('Given an exit with no layout (jsdom), Then no copy is left behind', () => {
    pill.to(ready, motion);
    pill.exit(motion);
    expect(document.querySelectorAll('[data-pill]')).toHaveLength(1);
  });
});
