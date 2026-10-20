import { createAppError, err, ok, type AppResult, type ThemeSettings } from '@app/shared';

import { isBuiltInThemeId } from './built-in-themes.js';

export const CUSTOM_THEME_ID_PREFIX = 'custom-' as const;

export function isCustomThemeId(value: string): boolean {
  return value.startsWith(CUSTOM_THEME_ID_PREFIX) && value.length > CUSTOM_THEME_ID_PREFIX.length;
}

export function createCustomThemeId(suffix: string): string {
  return `${CUSTOM_THEME_ID_PREFIX}${suffix}`;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  themeId: 'default',
  dark: false,
};

export function getDefaultThemeSettings(): ThemeSettings {
  return DEFAULT_THEME_SETTINGS;
}

function isKnownThemeId(themeId: string): boolean {
  return isBuiltInThemeId(themeId) || isCustomThemeId(themeId);
}

export function validateThemeSettings(input: unknown): AppResult<ThemeSettings> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(
      createAppError({ code: 'theme.invalid', message: 'Theme settings must be an object.' }),
    );
  }

  const record = input as Record<string, unknown>;
  // `presetId` is the pre-migration field name; backups and stored preferences carry it.
  const themeId = record['themeId'] ?? record['presetId'];
  const dark = record['dark'];

  if (typeof themeId !== 'string' || themeId.trim().length === 0) {
    return err(createAppError({ code: 'theme.invalid', message: 'Theme themeId is required.' }));
  }

  if (!isKnownThemeId(themeId)) {
    return err(createAppError({ code: 'theme.invalid', message: `Unknown theme "${themeId}".` }));
  }

  if (typeof dark !== 'boolean') {
    return err(
      createAppError({ code: 'theme.invalid', message: 'Theme dark flag must be boolean.' }),
    );
  }

  return ok({ themeId, dark });
}
