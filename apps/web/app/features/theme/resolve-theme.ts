import type { ThemeDefinition, ThemeSettings } from '@app/shared';

import { getBuiltInThemeDefinition } from './built-in-themes.js';
import { buildThemeCssVariablesForDefinition } from './derive.js';
import type { ThemeColorTokens } from './presets.js';
import type { ThemeAppearance } from './tokens.js';

export type { ThemeAppearance } from './tokens.js';

export function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveEffectiveDark(settings: ThemeSettings): boolean {
  if (settings.themeId === 'system') {
    return readSystemPrefersDark();
  }

  if (settings.themeId === 'minimal-light') {
    return false;
  }

  if (settings.themeId === 'minimal-dark' || settings.themeId === 'amoled-black') {
    return true;
  }

  return settings.dark;
}

export function resolveThemeAppearance(settings: ThemeSettings): ThemeAppearance {
  return resolveEffectiveDark(settings) ? 'dark' : 'light';
}

/**
 * Maps the resolved definition back to the flat token bundle the preview cards use.
 * Glass values come from the same derivation/override path as the applied variables.
 */
export function resolveThemeTokens(
  settings: ThemeSettings,
  definition?: ThemeDefinition,
): ThemeColorTokens {
  const appearance = resolveThemeAppearance(settings);
  const resolved = definition ?? getBuiltInThemeDefinition(settings.themeId);
  const seeds = resolved[appearance].seeds;
  const variables = buildThemeCssVariablesForDefinition(resolved, appearance);

  return {
    background: seeds.background,
    foreground: seeds.foreground,
    surface: seeds.surface,
    accent: seeds.accent,
    border: seeds.border,
    readerBackground: seeds.readerBackground,
    primary: seeds.primary,
    destructive: seeds.destructive,
    destructiveGlass: variables['--destructive-glass'],
    success: seeds.success,
    successGlass: variables['--success-glass'],
    warning: seeds.warning,
    warningGlass: variables['--warning-glass'],
  };
}
