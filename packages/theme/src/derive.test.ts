import { describe, expect, it } from 'vitest';
import type { ThemeDefinition } from '@app/shared';

import { getThemePreset } from './presets.js';
import { presetToThemeDefinition } from './built-in-themes.js';
import { contrastRatio } from './color.js';
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

    expect(
      contrastRatio(variables['--muted-foreground'], variables['--muted'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(variables['--destructive-foreground'], variables['--destructive'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(variables['--foreground'], variables['--accent'])!).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(variables['--destructive-glass'], variables['--background'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(variables['--warning-glass'], variables['--background'])!,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the derived dark foregrounds on their contrast targets', () => {
    const variables = buildThemeCssVariablesForDefinition(customDefinition(), 'dark');

    expect(
      contrastRatio(variables['--muted-foreground'], variables['--muted'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(variables['--destructive-foreground'], variables['--destructive'])!,
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(variables['--foreground'], variables['--accent'])!).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(variables['--destructive-glass']).toBe('#f87171');
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
  });
});
