export { applyThemeToRoot, buildThemeCssVariables, clearAppliedTheme } from './apply-theme.js';
export { ThemeCustomizationPage, type ThemeCustomizationPageProps } from './components/ThemeCustomizationPage.js';
export { fetchThemeSettings, fetchThemeSettingsWithDefaults } from './fetch-theme-settings.js';
export { toThemePreviewDefinition, toThemePreviewDefinitionForPreset } from './preview.js';
export {
  getThemePreset,
  isThemePresetId,
  THEME_PRESET_IDS,
  THEME_PRESETS,
  type ThemeColorTokens,
  type ThemePresetDefinition,
  type ThemePresetId,
} from './presets.js';
export { themeQueryKeys } from './query-keys.js';
export {
  readSystemPrefersDark,
  resolveEffectiveDark,
  resolveThemeAppearance,
  resolveThemeTokens,
  type ThemeAppearance,
} from './resolve-theme.js';
export { saveThemeSettings } from './save-theme-settings.js';
export type { ThemeSettings, ThemeSettingsPageData } from './types.js';
export {
  DEFAULT_THEME_SETTINGS,
  getDefaultThemeSettings,
  validateThemeSettings,
} from './validate-theme-settings.js';

export const PACKAGE_NAME = '@app/theme' as const;
