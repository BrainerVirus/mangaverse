import { describe, expect, it } from 'vitest';
import type { ThemeDefinition } from '@app/shared';

import { getThemePreset } from './presets.js';
import { presetToThemeDefinition } from './built-in-themes.js';
import { contrastRatio, isInSrgbGamut, mapToSrgbGamut, mixCssColors } from './color.js';
import { buildThemeCssVariablesForDefinition, deriveThemeVariables } from './derive.js';

function customDefinition(): ThemeDefinition {
  return {
    ...presetToThemeDefinition(getThemePreset('default')),
    id: 'custom-derive',
    name: 'Custom Derive',
    light: {
      seeds: {
        background: '#fdf6ec',
        foreground: '#2b2118',
        accent: '#f0e2cc',
        primary: '#7c4a1e',
        surface: '#fffaf2',
        border: '#e0cfb4',
        readerBackground: '#fdf6ec',
        destructive: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b',
      },
    },
    dark: {
      seeds: {
        background: '#16110c',
        foreground: '#f5ead6',
        accent: '#2a2118',
        primary: '#d4a853',
        surface: '#1f1810',
        border: '#3d3020',
        readerBackground: '#120d08',
        destructive: '#f87171',
        success: '#4ade80',
        warning: '#fbbf24',
      },
    },
  };
}

function withSeeds(
  definition: ThemeDefinition,
  appearance: 'light' | 'dark',
  seeds: Partial<ThemeDefinition['light']['seeds']>,
): ThemeDefinition {
  const base = definition[appearance];
  return {
    ...definition,
    [appearance]: { ...base, seeds: { ...base.seeds, ...seeds } },
  };
}

/** The regular glass fill the status tokens are checked against. */
function regularGlassFill(background: string, dark: boolean): string {
  return mixCssColors(background, dark ? '#141210' : '#ffffff', dark ? 0.66 : 0.68);
}

describe('theme derivation', () => {
  it('is deterministic', () => {
    const definition = customDefinition();
    expect(deriveThemeVariables(definition, 'light')).toEqual(
      deriveThemeVariables(definition, 'light'),
    );
    expect(deriveThemeVariables(definition, 'dark')).toEqual(
      deriveThemeVariables(definition, 'dark'),
    );
  });

  it('derives surfaces and fills from the seeds', () => {
    const variables = buildThemeCssVariablesForDefinition(customDefinition(), 'light');
    expect(variables['--popover']).toBe('#fffaf2');
    expect(variables['--card']).toBe('#fffaf2');
    expect(variables['--sidebar']).toBe('#fffaf2');
    expect(variables['--input']).toBe('#e0cfb4');
    expect(variables['--ring']).toBe('#7c4a1e');
    expect(variables['--muted']).toBe('#f0e2cc');
  });

  it('keeps the derived light foregrounds on their contrast targets', () => {
    const variables = buildThemeCssVariablesForDefinition(customDefinition(), 'light');
    const glass = regularGlassFill(variables['--background'], false);

    expect(
      contrastRatio(variables['--muted-foreground'], variables['--muted'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(variables['--destructive-foreground'], variables['--destructive'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(variables['--foreground'], variables['--accent'])!).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(variables['--destructive-glass'], glass)!).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(variables['--warning-glass'], glass)!).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the derived dark foregrounds on their contrast targets', () => {
    const variables = buildThemeCssVariablesForDefinition(customDefinition(), 'dark');
    const glass = regularGlassFill(variables['--background'], true);

    expect(
      contrastRatio(variables['--muted-foreground'], variables['--muted'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(variables['--destructive-foreground'], variables['--destructive'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(variables['--foreground'], variables['--accent'])!).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(variables['--destructive-glass'], glass)!).toBeGreaterThanOrEqual(4.5);
    expect(variables['--destructive-glass']).toBe(mapToSrgbGamut('#f87171'));
  });

  it('adjusts --ring to 3:1 without touching --primary', () => {
    const definition = withSeeds(customDefinition(), 'light', {
      background: '#ffffff',
      primary: '#f7f7f7',
    });

    const variables = deriveThemeVariables(definition, 'light');
    expect(variables['--primary']).toBe('#f7f7f7');
    expect(variables['--ring']).not.toBe('#f7f7f7');
    expect(contrastRatio(variables['--ring'], '#ffffff')!).toBeGreaterThanOrEqual(3);
  });

  it('picks a readable candidate when the foreground melts into the fills', () => {
    const definition = withSeeds(customDefinition(), 'light', {
      background: '#ffffff',
      foreground: '#f7f7f7',
      surface: '#fafafa',
      accent: '#f5f5f5',
    });

    const variables = deriveThemeVariables(definition, 'light');
    for (const [foregroundToken, fillToken] of [
      ['--popover-foreground', '--popover'],
      ['--card-foreground', '--card'],
      ['--accent-foreground', '--accent'],
      ['--secondary-foreground', '--secondary'],
      ['--sidebar-foreground', '--sidebar'],
      ['--sidebar-accent-foreground', '--sidebar-accent'],
      ['--destructive-foreground', '--destructive'],
    ] as const) {
      expect(
        contrastRatio(variables[foregroundToken], variables[fillToken]),
        `${foregroundToken} on ${fillToken}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(variables[foregroundToken]).not.toBe('#f7f7f7');
    }
  });

  it('mixes muted text toward the canvas when the seed is dark', () => {
    const definition = withSeeds(customDefinition(), 'light', { accent: '#101010' });

    const variables = deriveThemeVariables(definition, 'light');
    expect(
      contrastRatio(variables['--muted-foreground'], variables['--muted']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('gamut-maps glass statuses before the contrast check in both appearances', () => {
    const outOfGamut = 'oklch(0.7 0.4 150)';

    for (const appearance of ['light', 'dark'] as const) {
      const definition = withSeeds(customDefinition(), appearance, {
        destructive: outOfGamut,
      });
      const variables = deriveThemeVariables(definition, appearance);
      const glass = regularGlassFill(variables['--background'], appearance === 'dark');

      expect(isInSrgbGamut(variables['--destructive-glass'])).toBe(true);
      expect(contrastRatio(variables['--destructive-glass'], glass)!).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('lifts dark glass statuses that lose contrast on the dark glass fill', () => {
    const definition = withSeeds(customDefinition(), 'dark', {
      background: '#000000',
      destructive: '#201010',
    });

    const variables = deriveThemeVariables(definition, 'dark');
    const glass = regularGlassFill('#000000', true);
    expect(contrastRatio(variables['--destructive-glass'], glass)!).toBeGreaterThanOrEqual(4.5);
  });

  it('lets advanced overrides win over every derived token', () => {
    const definition = customDefinition();
    const overridden: ThemeDefinition = {
      ...definition,
      light: {
        ...definition.light,
        overrides: { '--background': '#123456', '--ring': 'oklch(0.6 0.1 20)' },
      },
    };

    const variables = buildThemeCssVariablesForDefinition(overridden, 'light');
    expect(variables['--background']).toBe('#123456');
    expect(variables['--ring']).toBe('oklch(0.6 0.1 20)');
    expect(variables['--foreground']).toBe(definition.light.seeds.foreground);
  });

  it('keeps built-in overrides pinned to the legacy bytes', () => {
    const definition = presetToThemeDefinition(getThemePreset('sakura'));
    expect(definition.light.overrides?.['--destructive-foreground']).toBe('#fafafa');
    expect(definition.light.overrides?.['--muted-foreground']).toBe('#71717a');
    expect(definition.dark.overrides?.['--muted-foreground']).toBe('#a1a1aa');
    expect(definition.light.overrides?.['--primary-foreground']).toBe('#fafafa');
  });
});
