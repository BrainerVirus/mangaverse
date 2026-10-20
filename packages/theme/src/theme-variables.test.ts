import { describe, expect, it } from 'vitest';

import { buildThemeCssVariables } from './apply-theme.js';
import { parseCssColor } from './color.js';
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
  if (rgb === undefined) {
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
  it.each(THEME_PRESET_IDS)('%s keeps the four shell fills apart', (themeId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ themeId, dark });
      const appearance = resolveThemeAppearance({ themeId, dark });

      for (let left = 0; left < SHELL_FILLS.length; left += 1) {
        for (let right = left + 1; right < SHELL_FILLS.length; right += 1) {
          const leftRole = SHELL_FILLS[left]!;
          const rightRole = SHELL_FILLS[right]!;
          const leftValue = variables[leftRole]!;
          const rightValue = variables[rightRole]!;

          expect(
            distance(leftValue, rightValue),
            `${themeId} (${appearance}): ${leftRole} ${leftValue} vs ${rightRole} ${rightValue}`,
          ).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  it.each(THEME_PRESET_IDS)('%s keeps the foreground readable on every shell fill', (themeId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ themeId, dark });
      const foreground = variables['--foreground']!;

      for (const role of SHELL_FILLS) {
        expect(
          contrast(foreground, variables[role]!),
          `${themeId}: ${foreground} on ${role} ${variables[role]!}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // DESIGN.md §3.3: the focus ring is a non-text indicator, so 3:1 is the floor. The theme
  // layer paints `--ring` from the preset's primary; every preset clears it on the canvas.
  it.each(THEME_PRESET_IDS)('%s keeps the focus ring at 3:1 or better', (themeId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ themeId, dark });

      expect(
        contrast(variables['--ring']!, variables['--background']!),
        `${themeId} (${resolveThemeAppearance({ themeId, dark })}): ${variables['--ring']} on ${variables['--background']}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  // DESIGN.md §3 / §2.4: a preset may tint the glass fills, but it never re-tiers them and
  // never touches the elevation scale.
  it('never repaints a glass tier or the elevation scale', () => {
    const variables = buildThemeCssVariables({ themeId: 'sakura', dark: true });
    const material = Object.keys(variables).filter(
      (key) =>
        key.startsWith('--glass') || key.startsWith('--elevation') || key.startsWith('--ambient'),
    );

    expect(material).toEqual([]);
  });

  it('resolves glass status colors for every preset without changing dark status colors', () => {
    for (const themeId of THEME_PRESET_IDS) {
      for (const dark of [false, true]) {
        const variables = buildThemeCssVariables({ themeId, dark });
        const appearance = resolveThemeAppearance({ themeId, dark });

        for (const token of GLASS_STATUS_TOKENS) {
          expect(variables[token.glass]).toBeTruthy();
          const expected =
            appearance === 'light'
              ? token.light
              : themeId === 'vercel-monochrome' && token.glass === '--success-glass'
                ? '#167bfa'
                : variables[token.status];
          expect(variables[token.glass]).toBe(expected);
        }
      }
    }
  });

  it('keeps glass status text above 4.5:1 on regular glass for every preset', () => {
    for (const themeId of THEME_PRESET_IDS) {
      for (const dark of [false, true]) {
        const settings = { themeId, dark };
        const variables = buildThemeCssVariables(settings);
        const appearance = resolveThemeAppearance(settings);
        const fill = regularGlassFill(variables['--background']!, appearance === 'dark');

        for (const token of GLASS_STATUS_TOKENS) {
          const foreground = variables[token.glass]!;
          expect(
            contrast(foreground, fill),
            `${themeId} (${appearance}): ${token.glass} ${foreground} on regular glass ${fill}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(THEME_PRESET_IDS)('%s emits only valid CSS colors', (themeId) => {
    for (const dark of [false, true]) {
      const variables = buildThemeCssVariables({ themeId, dark });
      const appearance = resolveThemeAppearance({ themeId, dark });

      for (const [role, value] of Object.entries(variables)) {
        expect(value, `${themeId} (${appearance}): ${role}`).toMatch(CSS_COLOR);
        expect(() => channels(value)).not.toThrow();
      }
    }
  });

  it('expresses the AMOLED neutral roles in oklch', () => {
    const variables = buildThemeCssVariables({ themeId: 'amoled-black', dark: true });

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
