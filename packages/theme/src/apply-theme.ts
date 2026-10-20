import type { ThemeDefinition, ThemeSettings } from '@app/shared';

import { buildThemeCssVariablesForDefinition } from './derive.js';
import { getBuiltInThemeDefinition } from './built-in-themes.js';
import { resolveThemeAppearance } from './resolve-theme.js';
import { THEME_CSS_VARIABLES, type ThemeCssVariables } from './tokens.js';

/** Resolves a custom theme definition when the caller loaded one, else the built-in. */
export function resolveThemeDefinitionForSettings(
  settings: ThemeSettings,
  definition?: ThemeDefinition,
): ThemeDefinition {
  return definition ?? getBuiltInThemeDefinition(settings.themeId);
}

export function buildThemeCssVariables(
  settings: ThemeSettings,
  definition?: ThemeDefinition,
): ThemeCssVariables {
  const resolved = resolveThemeDefinitionForSettings(settings, definition);
  return buildThemeCssVariablesForDefinition(resolved, resolveThemeAppearance(settings));
}

export function applyThemeToRoot(
  root: HTMLElement,
  settings: ThemeSettings,
  definition?: ThemeDefinition,
): void {
  const appearance = resolveThemeAppearance(settings);
  const cssVariables = buildThemeCssVariables(settings, definition);

  root.classList.remove('light', 'dark');
  root.classList.add(appearance);

  for (const key of THEME_CSS_VARIABLES) {
    root.style.setProperty(key, cssVariables[key]);
  }
}

export function clearAppliedTheme(root: HTMLElement): void {
  for (const key of THEME_CSS_VARIABLES) {
    root.style.removeProperty(key);
  }
}
