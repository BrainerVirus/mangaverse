import type { AppDrizzleDb } from '@app/db';

import { isCustomThemeId } from './validate-theme-settings.js';
import type { ThemeSettingsPageData } from './types.js';

export async function fetchThemeSettings(db: AppDrizzleDb): Promise<ThemeSettingsPageData> {
  const { getThemeDefinition, getThemeSettings } = await import('@app/db');
  const settings = await getThemeSettings(db);
  if (!isCustomThemeId(settings.themeId)) {
    return { settings };
  }

  const theme = await getThemeDefinition(db, settings.themeId);
  return theme === undefined ? { settings } : { settings, theme };
}

/** Stored settings already fall back to defaults in the repository; kept for callers. */
export async function fetchThemeSettingsWithDefaults(
  db: AppDrizzleDb,
): Promise<ThemeSettingsPageData> {
  return fetchThemeSettings(db);
}
