// @vitest-environment node
import { describe, expect, it } from 'vitest';

import golden from './__fixtures__/built-in-theme-variables.json';
import { buildThemeCssVariables } from './apply-theme.js';
import { getBuiltInThemeDefinition, presetToThemeDefinition } from './built-in-themes.js';
import { getThemePreset, THEME_PRESET_IDS } from './presets.js';
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
