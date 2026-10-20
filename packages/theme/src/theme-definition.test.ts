import { describe, expect, it } from 'vitest';
import { THEME_SEED_TOKEN_NAMES, type ThemeDefinition } from '@app/shared';

import { getThemePreset } from './presets.js';
import { presetToThemeDefinition } from './built-in-themes.js';
import {
  normalizeThemeDefinition,
  themeDefinitionSchema,
  validateThemeDefinition,
} from './theme-definition.js';

function customDefinition(): ThemeDefinition {
  return {
    ...presetToThemeDefinition(getThemePreset('default')),
    id: 'custom:demo',
    name: 'Custom Demo',
    basedOn: 'default',
  };
}

describe('ThemeDefinition schema', () => {
  it('accepts every built-in definition', () => {
    for (const presetId of ['default', 'amoled-black', 'high-contrast'] as const) {
      expect(validateThemeDefinition(presetToThemeDefinition(getThemePreset(presetId))).ok).toBe(
        true,
      );
    }
  });

  it('accepts any CSS Color 4 seed value', () => {
    const definition = customDefinition();
    const result = validateThemeDefinition({
      ...definition,
      light: {
        ...definition.light,
        seeds: {
          ...definition.light.seeds,
          background: 'color(display-p3 1 0 0)',
          foreground: 'hsl(120 50% 50%)',
          accent: 'lab(50% 20 30)',
        },
      },
      dark: {
        ...definition.dark,
        seeds: {
          ...definition.dark.seeds,
          border: 'hwb(120 10% 20%)',
        },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('keeps the field path for an invalid seed color', () => {
    const definition = customDefinition();
    const result = validateThemeDefinition({
      ...definition,
      light: {
        ...definition.light,
        seeds: { ...definition.light.seeds, background: 'not-a-color' },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('light.seeds.background');
    expect(result.error.message).toContain('light.seeds.background');
    expect(result.error.details?.['path']).toBe('light.seeds.background');
  });

  it('rejects unknown override tokens and keeps their path', () => {
    const definition = customDefinition();
    const result = validateThemeDefinition({
      ...definition,
      dark: {
        ...definition.dark,
        overrides: { '--not-a-token': '#fff' },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('dark.overrides');
  });

  it('rejects an invalid override value with a token-level path', () => {
    const definition = customDefinition();
    const result = validateThemeDefinition({
      ...definition,
      dark: {
        ...definition.dark,
        overrides: { '--ring': 'nope' },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('dark.overrides.--ring');
  });

  it('requires all ten seeds', () => {
    const definition = customDefinition();
    const { accent: _accent, ...partialSeeds } = definition.light.seeds;
    const result = validateThemeDefinition({
      ...definition,
      light: { ...definition.light, seeds: partialSeeds },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('light.seeds.accent');
  });

  it('rejects an explicit undefined optional field', () => {
    const input = { ...customDefinition() } as Record<string, unknown>;
    input['basedOn'] = undefined;
    expect(validateThemeDefinition(input).ok).toBe(false);
  });

  it('exposes the seed list the schema validates', () => {
    expect(THEME_SEED_TOKEN_NAMES).toHaveLength(10);
    expect(themeDefinitionSchema).toBeDefined();
  });

  it('normalizes every color to OKLCH before storage', () => {
    const definition = customDefinition();
    const normalized = normalizeThemeDefinition({
      ...definition,
      light: {
        ...definition.light,
        seeds: { ...definition.light.seeds, background: 'rgb(255 0 0)' },
        overrides: { '--ring': '#00ff00' },
      },
    });

    expect(normalized.light.seeds.background).toMatch(/^oklch\(/);
    expect(normalized.light.overrides?.['--ring']).toMatch(/^oklch\(/);
    expect(normalized.id).toBe('custom:demo');
    expect(normalized.basedOn).toBe('default');
  });
});
