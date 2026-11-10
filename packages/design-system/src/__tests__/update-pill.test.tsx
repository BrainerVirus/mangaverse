import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdatePill } from '../components/update-pill.js';

const glyph = <svg data-glyph />;

describe('UpdatePill', () => {
  it('Given no progress, Then it is a pill button with the icon first and no ring', () => {
    const html = renderToStaticMarkup(<UpdatePill icon={glyph} label="Restart to update" />);
    expect(html).toContain('type="button"');
    expect(html).toContain('rounded-badge');
    expect(html).toContain('h-7');
    expect(html).toContain('gap-1.5');
    expect(html).toContain('px-3');
    expect(html).toContain('tabular-nums');
    expect(html).not.toContain('data-progress-ring');
    expect(html.indexOf('data-glyph')).toBeLessThan(html.indexOf('Restart to update'));
  });

  it('Given the neutral tone, Then it sits on a sidebar control surface', () => {
    const html = renderToStaticMarkup(<UpdatePill icon={glyph} label="40%" />);
    expect(html).toContain('data-tone="neutral"');
    expect(html).toContain('bg-sidebar-accent/30');
    expect(html).toContain('hover:bg-sidebar-accent/50');
  });

  it('Given the attention tone, Then it is the filled primary', () => {
    const html = renderToStaticMarkup(<UpdatePill tone="attention" icon={glyph} label="Go" />);
    expect(html).toContain('data-tone="attention"');
    expect(html).toContain('bg-primary');
    expect(html).toContain('text-primary-foreground');
  });

  it('Given a keyboard user, Then focus-visible shows a ring', () => {
    const html = renderToStaticMarkup(<UpdatePill icon={glyph} label="Go" />);
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-visible:ring-ring');
    expect(html).toContain('focus-visible:ring-offset-2');
  });

  it.each([
    [0, 1],
    [25, 0.75],
    [100, 0],
  ])('Given %i%, Then the arc leaves %f of the circle undrawn', (percent, left) => {
    const html = renderToStaticMarkup(<UpdatePill icon={glyph} label="x" progress={percent} />);
    const circumference = 2 * Math.PI * 14;
    expect(html).toContain('data-progress-ring');
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain('r="14"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain(`stroke-dashoffset="${circumference * left}"`);
  });

  it('Given a progress outside 0-100, Then the arc is clamped', () => {
    const over = renderToStaticMarkup(<UpdatePill icon={glyph} label="x" progress={140} />);
    const under = renderToStaticMarkup(<UpdatePill icon={glyph} label="x" progress={-5} />);
    expect(over).toContain('stroke-dashoffset="0"');
    expect(under).toContain(`stroke-dashoffset="${2 * Math.PI * 14}"`);
  });
});
