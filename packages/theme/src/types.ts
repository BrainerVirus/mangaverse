import type { ThemeDefinition, ThemeSettings } from '@app/shared';

export type { ThemeSettings };

export interface ThemeSettingsPageData {
  readonly settings: ThemeSettings;
  /** Present when the selected themeId resolves to a stored custom theme. */
  readonly theme?: ThemeDefinition;
}
