import { gsap } from 'gsap';
import { DURATION } from '../tokens/duration.js';
import { EASING } from '../tokens/easing.js';

/**
 * The motion of the title bar's Update pill (a quiet, one-element control in a fixed bar): the
 * label slides between phases, the percent counts and the ring fills on the same clock, the pill
 * widens to fit, a finished download closes its ring, pops a check and turns into the restart call
 * to action, a restart spins. Only transform, opacity and colour move, plus the deliberate width
 * tween. Every step collapses to the end state for reduced motion, and none of it holds a click
 * or the accessible name back: the DOM already carries the new text and name when it starts.
 */
export type UpdatePillKind = 'downloading' | 'ready' | 'queued' | 'restarting';
export type UpdatePillIcon = 'download' | 'check' | 'rotate' | 'clock';

export interface UpdatePillFrame {
  readonly kind: UpdatePillKind;
  /** The visible text, as React rendered it (a trailing `…` is drawn as three dots). */
  readonly label: string;
  /** 0-100 while downloading, else `null`. */
  readonly percent: number | null;
}

export interface UpdatePillParts {
  readonly pill: HTMLElement;
  /** A token-coloured halo layer behind the pill: the one soft pulse of the ready call to action. */
  readonly glow: HTMLElement;
  /** A `bg-primary` layer under the content: it fades in or out as the pill changes tone. */
  readonly fill: HTMLElement;
  readonly ring: Element;
  readonly arc: SVGElement | null;
  readonly icons: Readonly<Record<UpdatePillIcon, HTMLElement>>;
  /** The clipping box around the text: ghosts of the previous label live in it. */
  readonly labelSlot: HTMLElement;
  /** The element whose first child is the label's text node. */
  readonly text: HTMLElement;
  readonly dots: readonly HTMLElement[];
}

/** Times in seconds, from the shared duration scale. */
export const UPDATE_PILL_TIMING = {
  /** The label swap, the icon crossfade, the width and the counter. */
  swap: DURATION.standard / 1000,
  /** The ring and the counter between two download ticks. */
  count: 0.3,
  /** The one-time download -> ready morph. */
  celebrate: 0.65,
  enter: DURATION.standard / 1000,
  exit: DURATION.quick / 1000,
} as const;

/** The glyph inside the ring is drawn at 10px against the 14px of the other icons. */
const ICON_IN_RING_SCALE = 0.7;
const HIDDEN_ICON = { opacity: 0, scale: 0.6, rotation: 0 } as const;
const SLIDE = 8;

const ICON_FOR_KIND: Record<UpdatePillKind, UpdatePillIcon> = {
  downloading: 'download',
  ready: 'rotate',
  queued: 'clock',
  restarting: 'rotate',
};
const ICON_NAMES: readonly UpdatePillIcon[] = ['download', 'check', 'rotate', 'clock'];

function toneOf(kind: UpdatePillKind): 'attention' | 'neutral' {
  return kind === 'ready' ? 'attention' : 'neutral';
}

function iconRest(kind: UpdatePillKind, icon: UpdatePillIcon) {
  if (ICON_FOR_KIND[kind] !== icon) return HIDDEN_ICON;
  return { opacity: 1, scale: icon === 'download' ? ICON_IN_RING_SCALE : 1, rotation: 0 };
}

function arcOffset(parts: UpdatePillParts, percent: number | null): number | null {
  if (parts.arc === null || percent === null) return null;
  const circumference = Number(parts.arc.getAttribute('stroke-dasharray'));
  if (!Number.isFinite(circumference)) return null;
  return circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
}

const PLAIN_COLOUR = /^rgba?\(/;

function readColours(pill: HTMLElement) {
  const style = getComputedStyle(pill);
  return { backgroundColor: style.backgroundColor, color: style.color };
}

export interface UpdatePillMotionOptions {
  readonly reducedMotion: boolean;
}

export interface UpdatePillMotion {
  /** Show the first frame, or move from the last frame to this one. */
  to: (frame: UpdatePillFrame, options: UpdatePillMotionOptions) => void;
  /** The hover and keyboard-focus lift of the ready pill: its restart glyph turns half a turn. */
  hover: (on: boolean, options: UpdatePillMotionOptions) => void;
  /** The press of the ready pill. */
  press: (on: boolean, options: UpdatePillMotionOptions) => void;
  /** Fade a copy of the pill out where it was; call as the pill leaves. */
  exit: (options: UpdatePillMotionOptions) => void;
  /** Stop everything this controller started. */
  dispose: () => void;
}

/**
 * One controller per pill element. It keeps what a transition needs from the frame before: the
 * label, the width, the tone's colours and the loops (spinner, dots). Call `to` after every
 * render, from a layout effect scoped to the pill (`useGsapContext`); the DOM already shows the
 * new text, so the helper sets the old one back for the length of the swap.
 */
export function createUpdatePillMotion(parts: UpdatePillParts): UpdatePillMotion {
  const { pill, glow, fill, ring, arc, icons, labelSlot, text, dots } = parts;
  const createdAt = Date.now();
  let last: UpdatePillFrame | null = null;
  let lastWidth = 0;
  let timeline: gsap.core.Timeline | null = null;
  let spin: gsap.core.Tween | null = null;
  let dotLoop: gsap.core.Timeline | null = null;
  const counter = { value: 0 };
  const everything = (): gsap.TweenTarget[] => [
    pill,
    glow,
    fill,
    ring,
    text,
    counter,
    ...(arc === null ? [] : [arc]),
    ...Object.values(icons),
  ];
  const toneColours: Partial<Record<'attention' | 'neutral', ReturnType<typeof readColours>>> = {};

  const textNode = (): Text | null => (text.firstChild instanceof Text ? text.firstChild : null);
  const setText = (value: string): void => {
    const node = textNode();
    if (node !== null) node.nodeValue = value;
  };
  const visibleBase = (label: string): string => (label.endsWith('…') ? label.slice(0, -1) : label);

  function stopLoops(): void {
    spin?.kill();
    spin = null;
    dotLoop?.kill();
    dotLoop = null;
  }

  function startLoops(kind: UpdatePillKind): void {
    stopLoops();
    if (kind !== 'restarting') return;
    spin = gsap.to(icons.rotate, { rotation: 360, duration: 0.9, ease: 'none', repeat: -1 });
    if (dots.length === 0) return;
    dotLoop = gsap.timeline({ repeat: -1 });
    dotLoop
      .set(dots, { opacity: 0.15 })
      .to(dots, { opacity: 1, duration: 0.18, ease: EASING.standardOut, stagger: 0.2 })
      .to(dots, { opacity: 0.15, duration: 0.18, ease: EASING.standardOut }, '+=0.3');
  }

  /** The end state of a frame, set without motion. */
  function rest(frame: UpdatePillFrame): void {
    gsap.killTweensOf(everything());
    timeline?.kill();
    timeline = null;
    stopLoops();
    for (const name of ICON_NAMES) gsap.set(icons[name], iconRest(frame.kind, name));
    gsap.set(ring, { opacity: frame.kind === 'downloading' ? 1 : 0 });
    const offset = arcOffset(parts, frame.percent);
    if (arc !== null && offset !== null) gsap.set(arc, { strokeDashoffset: offset });
    gsap.set(text, { opacity: 1, y: 0 });
    gsap.set(glow, { opacity: 0, scale: 1 });
    gsap.set(fill, { opacity: 0 });
    gsap.set(pill, { clearProps: 'width,transform,opacity,backgroundColor,color,transition' });
    setText(visibleBase(frame.label));
    if (frame.percent !== null) counter.value = frame.percent;
  }

  function removeGhosts(): void {
    for (const ghost of labelSlot.querySelectorAll('[data-pill-ghost]')) ghost.remove();
  }

  /** The previous label, kept as a clipped copy that slides out while the new one slides in. */
  function ghostOf(label: string): HTMLElement {
    const ghost = document.createElement('span');
    ghost.setAttribute('data-pill-ghost', '');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.className = text.className;
    ghost.textContent = label;
    Object.assign(ghost.style, { position: 'absolute', left: '0', top: '0' });
    labelSlot.append(ghost);
    return ghost;
  }

  /** The text of the next label comes in from below while the ghost of the last one leaves above. */
  function swapLabel(
    tl: gsap.core.Timeline,
    previous: UpdatePillFrame,
    at: number,
    ghostFrom?: { from: number; to: number },
  ): void {
    const ghost = ghostOf(previous.label);
    tl.fromTo(
      ghost,
      { opacity: 1, y: 0 },
      {
        opacity: 0,
        y: -SLIDE,
        duration: UPDATE_PILL_TIMING.swap,
        ease: EASING.standardOut,
        onComplete: () => ghost.remove(),
      },
      at,
    );
    if (ghostFrom !== undefined) {
      const ghostCount = { value: ghostFrom.from };
      tl.to(
        ghostCount,
        {
          value: ghostFrom.to,
          duration: UPDATE_PILL_TIMING.count / 2,
          ease: EASING.standardOut,
          onUpdate: () => {
            ghost.textContent = `${Math.round(ghostCount.value)}%`;
          },
        },
        0,
      );
    }
    tl.fromTo(
      text,
      { opacity: 0, y: SLIDE },
      {
        opacity: 1,
        y: 0,
        duration: UPDATE_PILL_TIMING.swap,
        ease: EASING.standardOut,
        clearProps: 'transform',
      },
      at + 0.04,
    );
  }

  function morphWidth(tl: gsap.core.Timeline | null, at: number, duration: number): void {
    const inflight = pill.style.width !== '';
    const from = inflight ? pill.getBoundingClientRect().width : lastWidth;
    gsap.killTweensOf(pill, 'width');
    gsap.set(pill, { width: 'auto' });
    const natural = pill.getBoundingClientRect().width;
    lastWidth = natural;
    if (from <= 0 || natural <= 0 || Math.abs(from - natural) < 0.5) return;
    const vars = { width: natural, duration, ease: EASING.standardOut, clearProps: 'width' };
    if (tl === null) gsap.fromTo(pill, { width: from }, vars);
    else tl.fromTo(pill, { width: from }, vars, at);
  }

  /**
   * The tone glides: the primary fill fades in over the old surface (frozen as an inline colour,
   * since the class has already switched) or fades out to reveal the new one, and the text colour
   * follows. A text colour the parser cannot read snaps.
   */
  function morphTone(
    tl: gsap.core.Timeline,
    previous: UpdatePillFrame,
    next: UpdatePillFrame,
    at: number,
    duration: number,
  ): void {
    const was = toneColours[toneOf(previous.kind)];
    const now = readColours(pill);
    toneColours[toneOf(next.kind)] = now;
    if (toneOf(previous.kind) === toneOf(next.kind) || was === undefined) return;
    const toAttention = toneOf(next.kind) === 'attention';
    if (toAttention && was.backgroundColor !== '') {
      gsap.set(pill, { backgroundColor: was.backgroundColor, transition: 'none' });
    }
    tl.fromTo(
      fill,
      { opacity: toAttention ? 0 : 1 },
      { opacity: toAttention ? 1 : 0, duration, ease: EASING.standardOut },
      at,
    );
    tl.set(fill, { opacity: 0 }, at + duration);
    tl.set(pill, { clearProps: 'backgroundColor,transition' }, at + duration);
    if (PLAIN_COLOUR.test(was.color) && PLAIN_COLOUR.test(now.color)) {
      tl.fromTo(
        pill,
        { color: was.color },
        { color: now.color, duration, ease: EASING.standardOut, clearProps: 'color' },
        at,
      );
    }
  }

  function pulse(tl: gsap.core.Timeline, at: number): void {
    tl.fromTo(
      glow,
      { opacity: 0.4, scale: 1 },
      { opacity: 0, scale: 1.3, duration: 0.6, ease: EASING.standardOut },
      at,
    );
  }

  /** The ring closes, the download glyph leaves, a check pops and turns into the restart glyph. */
  function celebrate(next: UpdatePillFrame, previous: UpdatePillFrame): gsap.core.Timeline {
    const tl = gsap.timeline();
    const offset = arcOffset(parts, 100);
    if (arc !== null && offset !== null) {
      tl.to(
        arc,
        {
          strokeDashoffset: offset,
          duration: UPDATE_PILL_TIMING.count / 2,
          ease: EASING.standardOut,
        },
        0,
      );
    }
    tl.to(
      icons.download,
      { opacity: 0, scale: 0, duration: DURATION.quick / 1000, ease: EASING.standardOut },
      0.1,
    );
    tl.fromTo(
      icons.check,
      { opacity: 0, scale: 0, rotation: 0 },
      { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' },
      0.1,
    );
    const turn = 0.35;
    tl.to(
      icons.check,
      { opacity: 0, scale: 0.4, rotation: 90, duration: 0.18, ease: EASING.standardOut },
      turn,
    );
    tl.fromTo(
      icons.rotate,
      { opacity: 0, scale: 0.4, rotation: -90 },
      { opacity: 1, scale: 1, rotation: 0, duration: 0.22, ease: EASING.emphasizedOut },
      turn,
    );
    tl.to(ring, { opacity: 0, duration: 0.2, ease: EASING.standardOut }, turn);
    // Until the turn, the old text stays and counts up; then the new text slides in.
    gsap.set(text, { opacity: 0 });
    morphWidthAt(tl, turn);
    morphTone(tl, previous, next, turn, 0.25);
    swapLabel(
      tl,
      previous,
      turn,
      previous.percent === null ? undefined : { from: previous.percent, to: 100 },
    );
    pulse(tl, turn + 0.2);
    return tl;
  }

  function morphWidthAt(tl: gsap.core.Timeline, at: number): void {
    morphWidth(tl, at, 0.3);
  }

  function crossfadeIcons(
    tl: gsap.core.Timeline,
    previous: UpdatePillFrame,
    next: UpdatePillFrame,
  ): void {
    const from = ICON_FOR_KIND[previous.kind];
    const to = ICON_FOR_KIND[next.kind];
    if (from !== to) {
      tl.to(
        icons[from],
        { ...HIDDEN_ICON, duration: DURATION.quick / 1000, ease: EASING.standardOut },
        0,
      );
      tl.fromTo(
        icons[to],
        { ...HIDDEN_ICON },
        {
          ...iconRest(next.kind, to),
          duration: UPDATE_PILL_TIMING.swap,
          ease: EASING.emphasizedOut,
        },
        0.05,
      );
    }
    const ringOpacity = next.kind === 'downloading' ? 1 : 0;
    if ((previous.kind === 'downloading') !== (next.kind === 'downloading')) {
      tl.to(
        ring,
        { opacity: ringOpacity, duration: UPDATE_PILL_TIMING.swap, ease: EASING.standardOut },
        0,
      );
    }
  }

  function enter(frame: UpdatePillFrame): void {
    rest(frame);
    const tl = gsap.timeline();
    tl.fromTo(
      pill,
      { opacity: 0, x: SLIDE * 1.5 },
      {
        opacity: 1,
        x: 0,
        duration: UPDATE_PILL_TIMING.enter,
        ease: EASING.standardOut,
        clearProps: 'transform,opacity',
      },
      0,
    );
    if (frame.kind === 'ready') {
      tl.fromTo(
        pill,
        { scale: 0.92 },
        { scale: 1, duration: 0.32, ease: 'back.out(1.4)', clearProps: 'scale' },
        0,
      );
      pulse(tl, 0.12);
    }
    timeline = tl;
    startLoops(frame.kind);
    lastWidth = pill.getBoundingClientRect().width;
    toneColours[toneOf(frame.kind)] = readColours(pill);
  }

  function transition(previous: UpdatePillFrame, next: UpdatePillFrame): void {
    // A finished transition leaves clean inline styles to measure from.
    timeline?.progress(1).kill();
    timeline = null;
    removeGhosts();

    if (previous.kind === next.kind) {
      const nextOffset = arcOffset(parts, next.percent);
      const counting = next.kind === 'downloading' && next.percent !== null;
      if (counting && nextOffset !== null) {
        if (arc !== null) {
          gsap.to(arc, {
            strokeDashoffset: nextOffset,
            duration: UPDATE_PILL_TIMING.count,
            ease: EASING.standardOut,
            overwrite: 'auto',
          });
        }
        const percent = next.percent;
        // Between ticks the text is the counter's own value, not React's.
        setText(`${Math.round(counter.value)}%`);
        gsap.to(counter, {
          value: percent,
          duration: UPDATE_PILL_TIMING.count,
          ease: EASING.standardOut,
          overwrite: 'auto',
          onUpdate: () => setText(`${Math.round(counter.value)}%`),
          onComplete: () => setText(visibleBase(next.label)),
        });
        morphWidth(null, 0, UPDATE_PILL_TIMING.count);
      } else if (previous.label !== next.label) {
        const tl = gsap.timeline();
        swapLabel(tl, previous, 0);
        morphWidth(tl, 0, UPDATE_PILL_TIMING.swap);
        timeline = tl;
      }
      return;
    }

    gsap.killTweensOf(arc === null ? [counter] : [counter, arc]);
    stopLoops();
    if (previous.kind === 'downloading' && next.kind === 'ready') {
      timeline = celebrate(next, previous);
    } else {
      const tl = gsap.timeline();
      crossfadeIcons(tl, previous, next);
      swapLabel(tl, previous, 0);
      morphWidth(tl, 0, UPDATE_PILL_TIMING.swap);
      morphTone(tl, previous, next, 0, UPDATE_PILL_TIMING.swap);
      timeline = tl;
    }
    // The loops start from the settled state, after the swap.
    timeline.call(
      () => startLoops(next.kind),
      undefined,
      next.kind === 'ready' ? UPDATE_PILL_TIMING.celebrate : UPDATE_PILL_TIMING.swap,
    );
    if (next.kind === 'downloading' && next.percent !== null) counter.value = next.percent;
  }

  return {
    to(frame, { reducedMotion }) {
      const previous = last;
      last = frame;
      if (reducedMotion) {
        rest(frame);
        return;
      }
      if (previous === null) {
        enter(frame);
        return;
      }
      if (previous.kind === frame.kind && previous.label === frame.label) {
        // Unchanged (a repeated render): only make sure the loops and the resting state are right.
        if (timeline === null && spin === null && dotLoop === null) startLoops(frame.kind);
        return;
      }
      transition(previous, frame);
    },

    hover(on, { reducedMotion }) {
      if (last?.kind !== 'ready') return;
      if (reducedMotion) {
        gsap.set(icons.rotate, { rotation: 0 });
        return;
      }
      gsap.to(icons.rotate, {
        rotation: on ? 180 : 0,
        duration: DURATION.standard / 1000,
        ease: EASING.standardOut,
        overwrite: 'auto',
      });
    },

    press(on, { reducedMotion }) {
      if (last?.kind !== 'ready' || reducedMotion) return;
      gsap.to(pill, {
        scale: on ? 0.97 : 1,
        duration: (on ? DURATION.micro : DURATION.standard) / 1000,
        ease: on ? EASING.standardOut : EASING.emphasizedOut,
        overwrite: 'auto',
        ...(on ? {} : { clearProps: 'scale' }),
      });
    },

    exit({ reducedMotion }) {
      const parent = pill.offsetParent;
      // Not before the pill has had a moment to show (a development double mount), nor off-screen.
      if (reducedMotion || !(parent instanceof HTMLElement) || Date.now() - createdAt < 400) return;
      const rect = pill.getBoundingClientRect();
      const box = parent.getBoundingClientRect();
      const copy = pill.cloneNode(true);
      if (!(copy instanceof HTMLElement)) return;
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('tabindex', '-1');
      copy.removeAttribute('aria-label');
      Object.assign(copy.style, {
        position: 'absolute',
        left: `${rect.left - box.left}px`,
        top: `${rect.top - box.top}px`,
        width: `${rect.width}px`,
        margin: '0',
        pointerEvents: 'none',
      });
      parent.append(copy);
      gsap.to(copy, {
        opacity: 0,
        x: SLIDE * 1.5,
        duration: UPDATE_PILL_TIMING.exit,
        ease: EASING.standardOut,
        onComplete: () => copy.remove(),
      });
    },

    dispose() {
      timeline?.kill();
      stopLoops();
      gsap.killTweensOf(everything());
      removeGhosts();
    },
  };
}
