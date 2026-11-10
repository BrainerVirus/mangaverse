import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { gsap } from 'gsap';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UpdatePill } from '../components/update-pill.js';
import { setInAppReducedMotionPreference } from '../motion/index.js';

describe('UpdatePill markup', () => {
  it('Given a ready release, Then it is a filled pill button with the restart glyph first and no ring', () => {
    const html = renderToStaticMarkup(<UpdatePill kind="ready" label="Restart to update" />);
    expect(html).toContain('type="button"');
    expect(html).toContain('rounded-badge');
    expect(html).toContain('h-5.5');
    expect(html).toContain('gap-1.5');
    expect(html).toContain('px-2.5');
    expect(html).toContain('size-3.5');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('data-tone="attention"');
    expect(html).not.toContain('data-progress-ring=');
    expect(html.indexOf('data-pill-icon="rotate"')).toBeLessThan(html.indexOf('Restart to update'));
  });

  it('Given a download, Then it sits on a sidebar control surface with a ring', () => {
    const html = renderToStaticMarkup(<UpdatePill kind="downloading" label="40%" progress={40} />);
    expect(html).toContain('data-tone="neutral"');
    expect(html).toContain('bg-sidebar-accent/30');
    expect(html).toContain('hover:bg-sidebar-accent/50');
    expect(html).toContain('data-progress-ring');
  });

  it('Given the ready tone, Then it is the filled primary', () => {
    const html = renderToStaticMarkup(<UpdatePill kind="ready" label="Go" />);
    expect(html).toContain('bg-primary');
    expect(html).toContain('text-primary-foreground');
  });

  it('Given a keyboard user, Then focus-visible shows a ring', () => {
    const html = renderToStaticMarkup(<UpdatePill kind="ready" label="Go" />);
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-visible:ring-ring');
    expect(html).toContain('focus-visible:ring-offset-0');
  });

  it.each([
    [0, 1],
    [25, 0.75],
    [100, 0],
  ])('Given %i%, Then the arc leaves %f of the circle undrawn', (percent, left) => {
    const html = renderToStaticMarkup(
      <UpdatePill kind="downloading" label="x" progress={percent} />,
    );
    const circumference = 2 * Math.PI * 14;
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain('r="14"');
    expect(html).toContain('stroke-width="3"');
    expect(html).toContain(`stroke-dashoffset="${circumference * left}"`);
  });

  it('Given a progress outside 0-100, Then the arc is clamped', () => {
    const over = renderToStaticMarkup(<UpdatePill kind="downloading" label="x" progress={140} />);
    const under = renderToStaticMarkup(<UpdatePill kind="downloading" label="x" progress={-5} />);
    expect(over).toContain('stroke-dashoffset="0"');
    expect(under).toContain(`stroke-dashoffset="${2 * Math.PI * 14}"`);
  });

  it('Given an ellipsis, Then it is three dots drawn one by one and hidden from assistive tech', () => {
    const html = renderToStaticMarkup(<UpdatePill kind="restarting" label="Restarting…" />);
    expect(html.match(/data-pill-dot/g)).toHaveLength(3);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('…');
  });

  it('Given only the active glyph, Then the others rest hidden', () => {
    const html = renderToStaticMarkup(<UpdatePill kind="queued" label="Restart queued" />);
    const layer = (name: string) =>
      html.slice(html.indexOf(`data-pill-icon="${name}"`)).split('>')[0] ?? '';
    expect(layer('clock')).not.toContain('opacity-0');
    for (const name of ['download', 'check', 'rotate']) expect(layer(name)).toContain('opacity-0');
  });
});

describe('UpdatePill wiring', () => {
  afterEach(() => {
    cleanup();
    setInAppReducedMotionPreference(false);
    gsap.globalTimeline.clear();
  });

  const layerOpacity = (name: string) =>
    document.querySelector<HTMLElement>(`[data-pill-icon="${name}"]`)!.style.opacity;

  it('Given a change of phase, Then the name and the label are in the DOM at once, before any motion ends', () => {
    const { rerender } = render(
      <UpdatePill kind="downloading" label="100%" progress={100} aria-label="Downloading" />,
    );
    rerender(
      <UpdatePill kind="ready" label="Restart to update" aria-label="Restart to update: go" />,
    );
    const button = screen.getByRole('button', { name: 'Restart to update: go' });
    // The old label's ghost is aria-hidden; the real text is already the new one.
    expect(button.querySelector('[data-pill-text]')!.textContent).toBe('Restart to update');
    expect(button.dataset.tone).toBe('attention');
  });

  it('Given reduced motion, Then a change of phase is an instant state change with nothing running', () => {
    setInAppReducedMotionPreference(true);
    const { rerender } = render(
      <UpdatePill kind="downloading" label="40%" progress={40} aria-label="Downloading" />,
    );
    rerender(<UpdatePill kind="ready" label="Restart to update" aria-label="Ready" />);
    expect(layerOpacity('rotate')).toBe('1');
    expect(layerOpacity('download')).toBe('0');
    expect(layerOpacity('check')).toBe('0');
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
    rerender(<UpdatePill kind="restarting" label="Restarting…" aria-label="Restarting" />);
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
    expect(document.querySelector('[data-pill-ghost]')).toBeNull();
  });

  it('Given the pill goes, Then nothing keeps running', () => {
    const { rerender, unmount } = render(
      <UpdatePill kind="ready" label="Restart to update" aria-label="Ready" />,
    );
    rerender(<UpdatePill kind="restarting" label="Restarting…" aria-label="Restarting" />);
    unmount();
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(0);
  });

  /** Run every finite tween to its end; infinite loops are left alone. */
  const settle = () => {
    act(() => {
      for (const child of gsap.globalTimeline.getChildren(true, true, true)) {
        if (child.repeat() !== -1 && child.parent === gsap.globalTimeline) child.progress(1);
      }
    });
  };

  it('Given the real sequence ready -> restarting, Then the dots (drawn only then) fade in turn and the glyph spins', () => {
    const { rerender, container } = render(
      <UpdatePill kind="ready" label="Restart to update" aria-label="Ready" />,
    );
    expect(container.querySelectorAll('[data-pill-dot]')).toHaveLength(0);
    rerender(<UpdatePill kind="restarting" label="Restarting…" aria-label="Restarting" />);
    settle();
    const dots = [...container.querySelectorAll<HTMLElement>('[data-pill-dot]')];
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(gsap.getTweensOf(dot).length).toBeGreaterThan(0);
    }
    const rotate = container.querySelector<HTMLElement>('[data-pill-icon="rotate"]')!;
    expect(gsap.getTweensOf(rotate).some((tween) => tween.repeat() === -1)).toBe(true);
  });

  it('Given ready with a swap under way, When the phase becomes installing, Then aria-disabled is still true after the swap', () => {
    const { rerender } = render(
      <UpdatePill kind="downloading" label="100%" progress={100} aria-label="Downloading" />,
    );
    settle();
    rerender(<UpdatePill kind="ready" label="Restart to update" aria-label="Ready" />);
    const button = screen.getByRole('button', { name: 'Ready' });
    expect(button.hasAttribute('data-motion-hold')).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // The app now disables it for good: a restart is queued.
    rerender(<UpdatePill kind="queued" label="Restart queued" aria-label="Queued" aria-disabled />);
    settle();
    const queued = screen.getByRole('button', { name: 'Queued' });
    expect(queued.hasAttribute('data-motion-hold')).toBe(false);
    expect(queued.getAttribute('aria-disabled')).toBe('true');
  });

  it('Given the hold ends on a pill the app never disabled, Then aria-disabled goes away', () => {
    const { rerender } = render(
      <UpdatePill kind="downloading" label="100%" progress={100} aria-label="Downloading" />,
    );
    settle();
    rerender(<UpdatePill kind="ready" label="Restart to update" aria-label="Ready" />);
    settle();
    expect(screen.getByRole('button', { name: 'Ready' }).hasAttribute('aria-disabled')).toBe(false);
  });

  it('Given the old label is still on show, Then a click is swallowed, and after the swap it goes through', () => {
    const onClick = vi.fn<() => void>();
    const { rerender } = render(
      <UpdatePill
        kind="downloading"
        label="100%"
        progress={100}
        aria-label="Downloading"
        onClick={onClick}
      />,
    );
    settle();
    rerender(
      <UpdatePill kind="ready" label="Restart to update" aria-label="Ready" onClick={onClick} />,
    );
    const button = screen.getByRole('button', { name: 'Ready' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    settle();
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('leaving the bar', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    const setup = () => {
      // jsdom has no layout: give the pill a parent to be positioned against.
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get(this: HTMLElement) {
          return this.parentElement;
        },
      });
      vi.useFakeTimers({ toFake: ['Date'] });
    };
    afterEach(() => {
      vi.useRealTimers();
      if (original !== undefined)
        Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
    });

    const clones = (container: HTMLElement) =>
      container.querySelectorAll('[aria-hidden="true"][data-kind]');

    it('Given motion, Then the pill leaves as a fading copy', () => {
      setup();
      const { unmount, container } = render(<UpdatePill kind="ready" label="Go" aria-label="Go" />);
      const parent = container;
      vi.setSystemTime(Date.now() + 500);
      unmount();
      expect(clones(parent)).toHaveLength(1);
    });

    it('Given reduced motion is switched on while mounted, Then leaving makes no copy', () => {
      setup();
      const { unmount, container } = render(<UpdatePill kind="ready" label="Go" aria-label="Go" />);
      vi.setSystemTime(Date.now() + 500);
      act(() => setInAppReducedMotionPreference(true));
      unmount();
      expect(clones(container)).toHaveLength(0);
    });
  });
});
