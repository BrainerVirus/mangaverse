import type { AppDrizzleDb } from '@app/db';

import { getDefaultThemeSettings } from './validate-theme-settings.js';
import type { ThemeSettingsPageData } from './types.js';

export async function fetchThemeSettings(db: AppDrizzleDb): Promise<ThemeSettingsPageData> {
  const { getThemeSettings } = await import('@app/db');
  const settings = await getThemeSettings(db);
  return { settings };
}

export async function fetchThemeSettingsWithDefaults(db: AppDrizzleDb): Promise<ThemeSettingsPageData> {
  const page = await fetchThemeSettings(db);
  return {
    settings: page.settings ?? getDefaultThemeSettings(),
  };
}
