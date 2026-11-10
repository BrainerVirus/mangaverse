import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { gsap } from 'gsap';
import { cleanup, render, screen } from '@testing-library/react';
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
});
