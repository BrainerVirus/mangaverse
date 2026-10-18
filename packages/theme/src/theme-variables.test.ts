import { describe, expect, it } from 'vitest';

import { buildThemeCssVariables } from './apply-theme.js';
import { THEME_PRESET_IDS } from './presets.js';
import { resolveThemeAppearance } from './resolve-theme.js';

/** The roles the shell paints side by side: the active nav row, hover fills and the sidebar. */
const SHELL_FILLS = ['--secondary', '--accent', '--sidebar', '--sidebar-accent'] as const;

function channels(hex: string): readonly [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
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
});
