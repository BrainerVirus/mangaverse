import { describe, expect, it } from 'vitest';

import { buildThemeCssVariables, parseCssColor } from './apply-theme.js';
import { THEME_PRESET_IDS } from './presets.js';
import { resolveThemeAppearance } from './resolve-theme.js';

/** The roles the shell paints side by side: the active nav row, hover fills and the sidebar. */
const SHELL_FILLS = ['--secondary', '--accent', '--sidebar', '--sidebar-accent'] as const;
const GLASS_STATUS_TOKENS = [
  { glass: '--destructive-glass', status: '--destructive', light: '#b91c1c' },
  { glass: '--success-glass', status: '--success', light: '#15803d' },
  { glass: '--warning-glass', status: '--warning', light: '#b45309' },
] as const;

/** Every string the theme layer emits must be a CSS color the design system can paint. */
const CSS_COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|oklch\([\d.]+ [\d.]+ [\d.]+\))$/i;

function channels(value: string): readonly [number, number, number] {
  const rgb = parseCssColor(value);
  if (rgb === null) {
    throw new Error(`Unparseable theme color: ${value}`);
  }
  return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
}

/** sRGB distance; 12 is about the smallest step a large flat surface reads as a different fill. */
function distance(a: string, b: string): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.round(Math.hypot(ar - br, ag - bg, ab - bb));
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
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

function lab(value: string): readonly [number, number, number] {
  const [r = 0, g = 0, b = 0] = channels(value).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 (Sharma et al. 2005); the reference pair below pins the implementation. */
function deltaE00(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): number {
  const [l1, a1, b1] = first;
  const [l2, a2, b2] = second;
  const rad = Math.PI / 180;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h1p = c1p === 0 ? 0 : (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2p = c2p === 0 ? 0 : (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p !== 0 && c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * rad) / 2);
  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP = h1p + h2p;
  if (c1p !== 0 && c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
    else hBarP = (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hBarP - 30) * rad) +
    0.24 * Math.cos(2 * hBarP * rad) +
    0.32 * Math.cos((3 * hBarP + 6) * rad) -
    0.2 * Math.cos((4 * hBarP - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt(
    (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh),
  );
}

function separation(a: string, b: string): number {
  return deltaE00(lab(a), lab(b));
}

function regularGlassFill(background: string, dark: boolean): string {
  const glass = dark ? [20, 18, 16] : [255, 255, 255];
  const alpha = dark ? 0.66 : 0.68;
  const backgroundChannels = channels(background);
  const fill = glass.map((channel, index) => {
    const base = backgroundChannels[index] ?? 0;
    return Math.round(channel * alpha + base * (1 - alpha));
  });
  return `#${fill.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

describe('shell fills per preset', () => {
  it.each(THEME_PRESET_IDS)('%s keeps the four shell fills apart', (presetId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ presetId, dark });
      const appearance = resolveThemeAppearance({ presetId, dark });

      for (let left = 0; left < SHELL_FILLS.length; left += 1) {
        for (let right = left + 1; right < SHELL_FILLS.length; right += 1) {
          const leftRole = SHELL_FILLS[left]!;
          const rightRole = SHELL_FILLS[right]!;
          const leftValue = variables[leftRole]!;
          const rightValue = variables[rightRole]!;

          expect(
            distance(leftValue, rightValue),
            `${presetId} (${appearance}): ${leftRole} ${leftValue} vs ${rightRole} ${rightValue}`,
          ).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  // AMOLED's true-black canvas leaves the default accent too close to the sidebar fill:
  // #141414 vs #0a0a0a is only ΔE00 2.13. The oklch accent keeps the pair at ≥3.
  it('keeps the AMOLED accent at least ΔE00 3 from the sidebar', () => {
    const variables = buildThemeCssVariables({ presetId: 'amoled-black', dark: true });
    const value = separation(variables['--accent']!, variables['--sidebar']!);

    expect(
      value,
      `accent ${variables['--accent']} vs sidebar ${variables['--sidebar']}`,
    ).toBeGreaterThanOrEqual(3);
  });

  // Pins the oracle itself: the published Sharma pairs are the reference values.
  it('computes CIEDE2000 from the published reference pairs', () => {
    expect(deltaE00([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE00([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(2.8615, 4);
  });

  it.each(THEME_PRESET_IDS)('%s keeps the foreground readable on every shell fill', (presetId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ presetId, dark });
      const foreground = variables['--foreground']!;

      for (const role of SHELL_FILLS) {
        expect(
          contrast(foreground, variables[role]!),
          `${presetId}: ${foreground} on ${role} ${variables[role]!}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // DESIGN.md §3.3: the focus ring is a non-text indicator, so 3:1 is the floor. The theme
  // layer paints `--ring` from the preset's primary; every preset clears it on the canvas.
  it.each(THEME_PRESET_IDS)('%s keeps the focus ring at 3:1 or better', (presetId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ presetId, dark });

      expect(
        contrast(variables['--ring']!, variables['--background']!),
        `${presetId} (${resolveThemeAppearance({ presetId, dark })}): ${variables['--ring']} on ${variables['--background']}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  // DESIGN.md §3 / §2.4: a preset may tint the glass fills, but it never re-tiers them and
  // never touches the elevation scale.
  it('never repaints a glass tier or the elevation scale', () => {
    const variables = buildThemeCssVariables({ presetId: 'sakura', dark: true });
    const material = Object.keys(variables).filter(
      (key) =>
        key.startsWith('--glass') || key.startsWith('--elevation') || key.startsWith('--ambient'),
    );

    expect(material).toEqual([]);
  });

  it('resolves glass status colors for every preset without changing dark status colors', () => {
    for (const presetId of THEME_PRESET_IDS) {
      for (const dark of [false, true]) {
        const variables = buildThemeCssVariables({ presetId, dark });
        const appearance = resolveThemeAppearance({ presetId, dark });

        for (const token of GLASS_STATUS_TOKENS) {
          expect(variables[token.glass]).toBeTruthy();
          const expected =
            appearance === 'light'
              ? token.light
              : presetId === 'vercel-monochrome' && token.glass === '--success-glass'
                ? '#167bfa'
                : variables[token.status];
          expect(variables[token.glass]).toBe(expected);
        }
      }
    }
  });

  it('keeps glass status text above 4.5:1 on regular glass for every preset', () => {
    for (const presetId of THEME_PRESET_IDS) {
      for (const dark of [false, true]) {
        const settings = { presetId, dark };
        const variables = buildThemeCssVariables(settings);
        const appearance = resolveThemeAppearance(settings);
        const fill = regularGlassFill(variables['--background']!, appearance === 'dark');

        for (const token of GLASS_STATUS_TOKENS) {
          const foreground = variables[token.glass]!;
          expect(
            contrast(foreground, fill),
            `${presetId} (${appearance}): ${token.glass} ${foreground} on regular glass ${fill}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(THEME_PRESET_IDS)('%s emits only valid CSS colors', (presetId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ presetId, dark });
      const appearance = resolveThemeAppearance({ presetId, dark });

      for (const [role, value] of Object.entries(variables)) {
        expect(value, `${presetId} (${appearance}): ${role}`).toMatch(CSS_COLOR);
        expect(() => channels(value)).not.toThrow();
      }
    }
  });

  it('expresses the AMOLED neutral roles in oklch', () => {
    const variables = buildThemeCssVariables({ presetId: 'amoled-black', dark: true });

    for (const role of [
      '--background',
      '--foreground',
      '--card',
      '--border',
      '--accent',
      '--secondary',
      '--sidebar',
      '--sidebar-accent',
      '--reader-background',
    ] as const) {
      expect(variables[role]).toMatch(/^oklch\(/);
    }
  });
});
