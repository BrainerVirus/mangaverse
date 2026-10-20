import { THEME_OVERRIDE_TOKENS } from '@app/shared';

/**
 * Every CSS variable a theme paints on the document root. The shared allow-list
 * also governs which tokens an advanced override may set, so the two cannot drift.
 */
export const THEME_CSS_VARIABLES = THEME_OVERRIDE_TOKENS;

export type ThemeCssVariable = (typeof THEME_CSS_VARIABLES)[number];
export type ThemeCssVariables = Readonly<Record<ThemeCssVariable, string>>;

export type ThemeAppearance = 'light' | 'dark';
