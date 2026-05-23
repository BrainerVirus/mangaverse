import type { ThemeSettings } from '@app/shared';

import { getThemePreset, type ThemeColorTokens } from './presets.js';

export type ThemeAppearance = 'light' | 'dark';

export function readSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveEffectiveDark(settings: ThemeSettings): boolean {
  if (settings.presetId === 'system') {
    return readSystemPrefersDark();
  }

  if (settings.presetId === 'minimal-light') {
    return false;
  }

  if (settings.presetId === 'minimal-dark' || settings.presetId === 'amoled-black') {
    return true;
  }

  return settings.dark;
}

export function resolveThemeAppearance(settings: ThemeSettings): ThemeAppearance {
  return resolveEffectiveDark(settings) ? 'dark' : 'light';
}

export function resolveThemeTokens(settings: ThemeSettings): ThemeColorTokens {
  const preset = getThemePreset(settings.presetId);
  const dark = resolveEffectiveDark(settings);
  return dark ? preset.dark : preset.light;
}
