import type { ThemeSettings } from '@app/shared';

/** Deleting the active custom theme returns the selection to the default built-in. */
export function themeSettingsAfterDelete(
  settings: ThemeSettings,
  deletedThemeId: string,
): ThemeSettings {
  return settings.themeId === deletedThemeId ? { ...settings, themeId: 'default' } : settings;
}
