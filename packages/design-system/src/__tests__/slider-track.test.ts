// @vitest-environment node
// Node (not jsdom) so `import.meta.url` is a file URL and the stylesheet can be read directly.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

/** The utility's body, up to the first closing brace at its own nesting level. */
function utilityBody(name: string): string {
  const start = css.indexOf(`@utility ${name} {`);
  expect(start, `missing utility: ${name}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}\n', start));
}

describe('slider track styles', () => {
  const body = utilityBody('slider-track');

  it('paints a visible track for both engines instead of only a thumb', () => {
    expect(body).toContain('::-webkit-slider-runnable-track');
    expect(body).toContain('::-moz-range-track');
    expect(body).toContain('height: 0.375rem');
  });

  it('uses the ring token for the track boundary and the primary token for the fill', () => {
    expect(body).toContain('inset 0 0 0 1px var(--ring)');
    expect(body).toContain('var(--primary)');
    expect(body).toContain('var(--secondary)');
    expect(body).toContain('var(--slider-fill');
  });
});
