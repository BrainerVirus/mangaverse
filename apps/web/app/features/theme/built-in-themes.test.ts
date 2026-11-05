// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import golden from './__fixtures__/built-in-theme-variables.json';
import { buildThemeCssVariables } from './apply-theme.js';
import { getBuiltInThemeDefinition, presetToThemeDefinition } from './built-in-themes.js';
import { getThemePreset, THEME_PRESET_IDS } from './presets.js';
import { THEME_CSS_VARIABLES } from './tokens.js';
import { validateThemeDefinition } from './theme-definition.js';

/**
 * `main` emitted these exact strings from the hand-rolled preset path. The definition
 * and derivation layer must reproduce them byte for byte, AMOLED oklch included.
 */
describe('built-in theme byte identity', () => {
  it.each(THEME_PRESET_IDS)('%s matches the pre-builder CSS variables', (themeId) => {
    for (const dark of [false, true]) {
      expect(buildThemeCssVariables({ themeId, dark })).toEqual(
        golden[`${themeId}:${dark ? 'dark' : 'light'}`],
      );
    }
  });

  it('expresses every built-in through a valid definition', () => {
    for (const presetId of THEME_PRESET_IDS) {
      const definition = presetToThemeDefinition(getThemePreset(presetId));
      expect(validateThemeDefinition(definition).ok).toBe(true);
      expect(getBuiltInThemeDefinition(presetId)).toEqual(definition);
    }
  });

  it('keeps the AMOLED dark theme in oklch', () => {
    const variables = buildThemeCssVariables({ themeId: 'amoled-black', dark: true });
    expect(variables['--background']).toBe('oklch(0 0 0)');
    expect(variables['--secondary']).toBe('oklch(0.31997 0 0)');
  });
});

/**
 * The stylesheet paints first; the theme layer repaints after hydration. The default
 * theme must therefore resolve to the stylesheet's own values, or every load flashes.
 */
describe('default theme matches the first paint', () => {
  const css = readFileSync(
    new URL('../../../../../packages/design-system/src/styles/globals.css', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  function declarations(selector: string): Record<string, string> {
    const start = css.indexOf(selector);
    expect(start, `missing block: ${selector}`).toBeGreaterThanOrEqual(0);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    return Object.fromEntries(
      [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    );
  }

  it.each([
    ['light', ':root,\n.light {'],
    ['dark', '.dark {'],
  ] as const)('paints the %s stylesheet values for every themed token', (appearance, selector) => {
    const stylesheet = declarations(selector);
    const themed = buildThemeCssVariables({ themeId: 'default', dark: appearance === 'dark' });
    // `--ring` is derived from the preset's `--primary` by design (DESIGN.md §3.3), and a
    // focus ring is not painted at first paint, so it is the one themed token not pinned.
    const mismatches = THEME_CSS_VARIABLES.filter(
      (key) => key !== '--ring' && themed[key] !== stylesheet[key],
    ).map((key) => `${key}: theme ${themed[key]} vs stylesheet ${stylesheet[key]}`);
    expect(mismatches).toEqual([]);
  });
});
