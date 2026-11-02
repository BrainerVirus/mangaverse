// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  deltaE,
  isCssColor,
  isInSrgbGamut,
  mapToSrgbGamut,
  mixCssColors,
  normalizeCssColor,
  parseCssColor,
} from './color.js';

const COLOR_4_INPUTS = [
  '#fafafa',
  '#e00',
  'rgb(255 0 0)',
  'rgb(100% 0% 0%)',
  'hsl(120 50% 50%)',
  'hwb(120 10% 20%)',
  'lab(50% 20 30)',
  'lch(50% 30 120)',
  'oklab(0.5 0.1 0.1)',
  'oklch(0.7 0.1 120)',
  'color(display-p3 1 0 0)',
  'color(rec2020 0.5 0.2 0.1)',
  'color(srgb 0.2 0.4 0.6)',
  'rebeccapurple',
] as const;

describe('CSS Color 4 input', () => {
  it.each(COLOR_4_INPUTS)('accepts and normalizes %s to OKLCH', (input) => {
    expect(isCssColor(input)).toBe(true);
    const normalized = normalizeCssColor(input);
    expect(normalized).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
    expect(isCssColor(normalized!)).toBe(true);
    expect(parseCssColor(input)).toBeDefined();
  });

  it('rejects values culori cannot parse', () => {
    for (const input of ['', 'not-a-color', 'rgb(', 'chartreuseish']) {
      expect(isCssColor(input)).toBe(false);
      expect(normalizeCssColor(input)).toBeUndefined();
    }
  });

  it('normalizes a known red to the documented OKLCH triple', () => {
    expect(normalizeCssColor('rgb(255 0 0)')).toBe('oklch(0.62796 0.25768 29.23388)');
    expect(normalizeCssColor('#ff0000')).toBe('oklch(0.62796 0.25768 29.23388)');
  });
});

describe('WCAG contrast', () => {
  it('reports the reference black-on-white ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('returns null for unparseable colors', () => {
    expect(contrastRatio('#000000', 'nope')).toBeNull();
  });
});

describe('CIEDE2000', () => {
  // culori resolves CSS lab() through D50→D65 before the CIEDE2000 formula, so the
  // Sharma pair lands at this value rather than the D65-labelled 2.0425. Pinned to
  // catch a silent switch of color space or difference formula.
  it('computes a reference pair through the CSS lab() pipeline', () => {
    expect(deltaE('lab(50% 2.6772 -79.7751)', 'lab(50% 0 -82.7485)')).toBeCloseTo(1.8566, 4);
  });

  it('is zero for identical colors and grows with distance', () => {
    expect(deltaE('#ef4444', '#ef4444')).toBe(0);
    expect(deltaE('#ef4444', '#b91c1c')!).toBeGreaterThan(1);
    expect(deltaE('#ef4444', '#ff0000')!).toBeLessThan(deltaE('#ef4444', '#b91c1c')!);
  });

  it('returns null for unparseable colors', () => {
    expect(deltaE('#000000', 'nope')).toBeNull();
  });
});

describe('sRGB gamut mapping', () => {
  it('flags an out-of-gamut OKLCH color and maps it back in', () => {
    const outOfGamut = 'oklch(0.7 0.4 150)';
    expect(isInSrgbGamut(outOfGamut)).toBe(false);
    expect(isInSrgbGamut('oklch(0.7 0.1 150)')).toBe(true);

    const mapped = mapToSrgbGamut(outOfGamut);
    expect(mapped).toMatch(/^oklch\(/);
    expect(isInSrgbGamut(mapped!)).toBe(true);
    expect(deltaE(outOfGamut, mapped!)).toBeLessThan(20);
  });

  it('returns undefined for unparseable colors', () => {
    expect(mapToSrgbGamut('nope')).toBeUndefined();
    expect(isInSrgbGamut('nope')).toBe(false);
  });
});

describe('legacy-compatible mixing', () => {
  it('keeps the historical hex bytes', () => {
    expect(mixCssColors('#f4f4f5', '#1a1a1a', 0.12)).toBe('#dadadb');
    expect(mixCssColors('#f4f4f5', '#1a1a1a', 0.24)).toBe('#c0c0c0');
  });

  it('keeps OKLCH notation when the source is OKLCH', () => {
    expect(mixCssColors('oklch(0.21 0 0)', 'oklch(0.9702 0 0)', 0.12)).toBe('oklch(0.31997 0 0)');
  });
});
