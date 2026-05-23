import { createAppError, err, ok, type AppResult, type ThemeSettings } from '@app/shared';

import { isThemePresetId } from './presets.js';

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  presetId: 'default',
  dark: false,
};

export function getDefaultThemeSettings(): ThemeSettings {
  return DEFAULT_THEME_SETTINGS;
}

export function validateThemeSettings(input: unknown): AppResult<ThemeSettings> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(createAppError({ code: 'theme.invalid', message: 'Theme settings must be an object.' }));
  }

  const record = input as Record<string, unknown>;
  const presetId = record.presetId;
  const dark = record.dark;

  if (typeof presetId !== 'string' || presetId.trim().length === 0) {
    return err(createAppError({ code: 'theme.invalid', message: 'Theme presetId is required.' }));
  }

  if (!isThemePresetId(presetId)) {
    return err(createAppError({ code: 'theme.invalid', message: `Unknown theme preset "${presetId}".` }));
  }

  if (typeof dark !== 'boolean') {
    return err(createAppError({ code: 'theme.invalid', message: 'Theme dark flag must be boolean.' }));
  }

  return ok({ presetId, dark });
}
