// @vitest-environment node
// Node (not jsdom) so `import.meta.url` is a file URL and the stylesheet can be read directly.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

/** The declaration block of a selector, e.g. `:root,\n.light { ... }` up to its closing brace. */
function block(selector: string, source = css): string {
  const normalized = source.replace(/\s+/g, ' ');
  const start = normalized.indexOf(selector.replace(/\s+/g, ' '));
  expect(start, `missing block: ${selector}`).toBeGreaterThanOrEqual(0);
  const open = normalized.indexOf('{', start);
  const close = normalized.indexOf('}', open);
  return normalized.slice(open, close);
}

function token(source: string, name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(source);
  expect(match, `missing token ${name}`).not.toBeNull();
  return match![1]!.replace(/\s+/g, ' ').trim();
}

const light = block(':root,\n.light {');
const dark = block('.dark {');

// --- WCAG 2.x relative luminance, the method DESIGN.md §3.5 measures with. ---

function channels(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The effective colour of a tier fill over a backdrop, as §3.5 computes it. */
function composite(fill: string, backdrop: string): string {
  const match = /(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)/.exec(fill);
  if (match === null) {
    throw new Error(`no rgb() fill in ${fill}`);
  }
  const [r, g, b, alpha] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  const [br, bg, bb] = channels(backdrop);
  return `#${[r, g, b]
    .map((c, index) =>
      Math.round(c * alpha + [br, bg, bb][index]! * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('glass tokens', () => {
  it('defines the four tiers with the §2.1 fills', () => {
    expect(token(light, '--glass-thin')).toBe('rgb(255 255 255 / 0.55)');
    expect(token(light, '--glass-regular')).toBe('rgb(255 255 255 / 0.68)');
    expect(token(light, '--glass-thick')).toBe('rgb(255 255 255 / 0.82)');
    expect(token(dark, '--glass-thin')).toBe('rgb(20 18 16 / 0.55)');
    expect(token(dark, '--glass-regular')).toBe('rgb(20 18 16 / 0.66)');
    expect(token(dark, '--glass-thick')).toBe('rgb(20 18 16 / 0.78)');
    // §2.1 — the stage is theme-independent.
    expect(token(block(':root {'), '--glass-stage')).toBe('rgb(0 0 0 / 0.78)');
    expect(dark).not.toContain('--glass-stage');
  });

  it('defines the §2.2 refraction recipe and the §3.5 plate', () => {
    expect(token(light, '--glass-edge')).toBe('rgb(255 255 255 / 0.5)');
    expect(token(light, '--glass-specular')).toBe('rgb(255 255 255 / 0.7)');
    expect(token(light, '--glass-inner')).toBe('inset 0 -1px 0 rgb(0 0 0 / 0.05)');
    expect(token(light, '--glass-sheen')).toContain('linear-gradient(180deg');
    expect(token(light, '--glass-plate')).toBe('rgb(255 255 255 / 0.35)');
    expect(token(dark, '--glass-edge')).toBe('rgb(255 255 255 / 0.08)');
    expect(token(dark, '--glass-plate')).toBe('rgb(20 18 16 / 0.35)');
    expect(token(light, '--glass-muted-foreground')).toBe('#57534e');
    expect(token(dark, '--glass-muted-foreground')).toBe('#d6d1ca');
  });

  it('keeps displacement inactive in low-transparency and reduced-motion profiles', () => {
    expect(css.replace(/\s+/g, ' ')).toContain(
      ':is([data-glass="cheap"], [data-transparency="solid"]) [data-refraction-surface="displacement"]',
    );
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('composes displacement with each tier filter on the backdrop-sampling surface', () => {
    const expected = {
      thin: 'blur(12px) saturate(140%)',
      regular: 'blur(20px) saturate(160%)',
      thick: 'blur(32px) saturate(180%)',
      stage: 'blur(24px) saturate(120%)',
    };

    for (const [tier, filter] of Object.entries(expected)) {
      const utility = block(`@utility glass-${tier} {`);
      expect(token(utility, '--glass-tier-filter')).toBe(filter);
      expect(token(utility, 'backdrop-filter')).toBe('var(--glass-tier-filter)');
    }

    const displacement = block('[data-refraction-surface="displacement"]');
    expect(token(displacement, '-webkit-backdrop-filter')).toBe(
      'var(--glass-refraction-filter) var(--glass-tier-filter)',
    );
    expect(token(displacement, 'backdrop-filter')).toBe(
      'var(--glass-refraction-filter) var(--glass-tier-filter)',
    );
    expect(displacement).not.toMatch(/(?:^|[;\s])filter:/);
  });

  it('disables surface displacement in CSS fallback profiles', () => {
    const surfaceSelector = '[data-refraction-surface="displacement"]';

    const fallbacks = [
      block(`:is([data-glass="cheap"], [data-transparency="solid"]) ${surfaceSelector}`),
      block(surfaceSelector, css.slice(css.indexOf('@supports not ((backdrop-filter: blur(1px))'))),
      block(
        surfaceSelector,
        css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)')),
      ),
      block(surfaceSelector, css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))),
    ];

    for (const fallback of fallbacks.slice(0, 3)) {
      expect(token(fallback, '-webkit-backdrop-filter')).toBe('none');
      expect(token(fallback, 'backdrop-filter')).toBe('none');
      expect(fallback).not.toMatch(/(?:^|[;\s])filter:/);
    }
    expect(token(fallbacks[3]!, '-webkit-backdrop-filter')).toBe('var(--glass-tier-filter)');
    expect(token(fallbacks[3]!, 'backdrop-filter')).toBe('var(--glass-tier-filter)');
  });

  it('hides the ambient band before profile resolution and in fallback modes', () => {
    expect(css).toContain(':root:not([data-glass="full"]) [data-ambient-backdrop]');
    expect(css).toContain(
      ':is([data-glass="cheap"], [data-transparency="solid"]) [data-ambient-backdrop]',
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-ambient-backdrop\]\s*\{\s*display: none;/,
    );
  });

  it('defines the three glass status colors and exposes them to Tailwind', () => {
    expect(token(light, '--destructive-glass')).toBe('#b91c1c');
    expect(token(light, '--success-glass')).toBe('#15803d');
    expect(token(light, '--warning-glass')).toBe('#b45309');
    expect(token(dark, '--destructive-glass')).toBe('#ef4444');
    expect(token(dark, '--success-glass')).toBe('#22c55e');
    expect(token(dark, '--warning-glass')).toBe('#f59e0b');
    expect(css).toContain('--color-destructive-glass: var(--destructive-glass)');
    expect(css).toContain('--color-success-glass: var(--success-glass)');
    expect(css).toContain('--color-warning-glass: var(--warning-glass)');
  });

  it('defines the ten P3 type roles as utilities, with 11px glass micro labels', () => {
    for (const role of [
      'type-display-xl',
      'type-display-lg',
      'type-title',
      'type-heading',
      'type-body',
      'type-body-lg',
      'type-label',
      'type-meta',
      'type-micro',
      'type-code',
    ]) {
      expect(css).toContain(`@utility ${role} {`);
    }
    expect(token(block('@utility type-micro {'), 'font-size')).toBe('11px');
    expect(token(block('@utility type-micro {'), 'font-weight')).toBe('500');
    expect(block('@theme inline {')).not.toContain('--text-');
  });

  it('defines the §2.3 ambient band', () => {
    expect(token(light, '--ambient-1')).toBe('#efe9e1');
    expect(token(light, '--ambient-2')).toBe('#f7f5f2');
    expect(token(dark, '--ambient-1')).toBe('#17140f');
    expect(token(dark, '--ambient-2')).toBe('#0c0b0a');
  });

  it('wires the §2.4 elevation scale onto the shadow tokens', () => {
    expect(token(light, '--elevation-1')).toBe('0 1px 2px rgb(0 0 0 / 0.04)');
    expect(token(dark, '--elevation-1')).toContain('inset 0 1px 0 rgb(255 255 255 / 0.03)');
    expect(css).toContain('--shadow-sm: var(--elevation-1)');
    expect(css).toContain('--shadow-md: var(--elevation-2)');
    expect(css).toContain('--shadow-lg: var(--elevation-3)');
    expect(css).toContain('--shadow-xl: var(--elevation-4)');
  });

  it('keeps every tier, the recipe and the ambient band resolvable', () => {
    for (const level of ['glass-thin', 'glass-regular', 'glass-thick', 'glass-stage']) {
      expect(css).toContain(`@utility ${level}`);
    }
    expect(css).toContain('@utility glass-refraction');
    expect(css).toContain('@utility glass-refraction-edge');
    expect(css).toContain('@utility glass-plate');
    expect(css).toContain('@utility ambient-backdrop');
  });

  it('defines the shared modal scrim as the documented backdrop-filter exception', () => {
    const scrim = block('@utility glass-scrim {');
    expect(token(scrim, 'background-color')).toBe('rgb(0 0 0 / 0.55)');
    expect(token(scrim, 'backdrop-filter')).toBe('blur(8px)');
  });

  it('carries the §2.5 resolution paths', () => {
    expect(css).toContain('[data-glass="cheap"]');
    expect(css).toContain('[data-transparency="solid"]');
    expect(css).toContain('[data-ambient-backdrop]');
    expect(css).toContain('@supports not ((backdrop-filter: blur(1px))');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    // The opaque resolution names the per-tier token, so the hierarchy survives.
    expect(css).toContain('background-color: var(--glass-opaque)');
    expect(css).toContain('--glass-opaque: var(--surface)');
    expect(css).toContain('--glass-opaque: var(--surface-raised)');
    expect(css).toContain('--glass-opaque: rgb(0 0 0 / 0.88)');
  });
});

describe('glass contrast floors (DESIGN.md §3.5)', () => {
  const canvasLight = token(light, '--background');
  const canvasDark = token(dark, '--background');
  const secondaryLight = token(light, '--glass-muted-foreground');
  const secondaryDark = token(dark, '--glass-muted-foreground');

  it('clears 4.5:1 for ink on every tier over the canvas', () => {
    for (const tier of ['--glass-thin', '--glass-regular', '--glass-thick'] as const) {
      expect(
        contrast('#141210', composite(token(light, tier), canvasLight)),
        `light ${tier}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast('#f5f2eb', composite(token(dark, tier), canvasDark)),
        `dark ${tier}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 4.5:1 for glass secondary text on thick glass over imagery', () => {
    expect(
      contrast(secondaryLight, composite('rgb(255 255 255 / 0.82)', '#000000')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(secondaryDark, composite('rgb(20 18 16 / 0.78)', '#ffffff')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 for glass status text on regular glass over the canvas', () => {
    const lightGlass = composite(token(light, '--glass-regular'), canvasLight);
    const darkGlass = composite(token(dark, '--glass-regular'), canvasDark);

    for (const status of ['destructive', 'success', 'warning'] as const) {
      expect(
        contrast(token(light, `--${status}-glass`), lightGlass),
        `light --${status}-glass`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token(dark, `--${status}-glass`), darkGlass),
        `dark --${status}-glass`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 7:1 for glass secondary text over the ambient canvas', () => {
    expect(contrast(secondaryLight, canvasLight)).toBeGreaterThanOrEqual(7);
    expect(contrast(secondaryDark, canvasDark)).toBeGreaterThanOrEqual(7);
  });

  it('keeps the focus ring at or above 3:1 on the canvas and on the surface (§3.3 fix)', () => {
    const ringLight = token(light, '--ring');
    const ringDark = token(dark, '--ring');

    expect(contrast(ringLight, canvasLight)).toBeGreaterThanOrEqual(3);
    expect(contrast(ringDark, canvasDark)).toBeGreaterThanOrEqual(3);
    expect(contrast(ringLight, token(light, '--surface'))).toBeGreaterThanOrEqual(3);
    expect(contrast(ringDark, token(dark, '--surface'))).toBeGreaterThanOrEqual(3);
    // The measured values §3.3 documents.
    expect(contrast(ringLight, canvasLight)).toBeCloseTo(4.41, 1);
    expect(contrast(ringDark, canvasDark)).toBeCloseTo(7.8, 1);
  });

  it('keeps white stage labels above 4.5:1 over a white page at the 0.78 alpha floor', () => {
    expect(contrast('#b3b3b3', composite('rgb(0 0 0 / 0.78)', '#ffffff'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
