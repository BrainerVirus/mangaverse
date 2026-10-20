/** Every CSS variable a theme paints on the document root. */
export const THEME_CSS_VARIABLES = [
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--popover',
  '--popover-foreground',
  '--card',
  '--card-foreground',
  '--border',
  '--input',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-glass',
  '--destructive-foreground',
  '--success',
  '--success-glass',
  '--warning',
  '--warning-glass',
  '--ring',
  '--reader-background',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-border',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
] as const;

export type ThemeCssVariable = (typeof THEME_CSS_VARIABLES)[number];
export type ThemeCssVariables = Readonly<Record<ThemeCssVariable, string>>;

export type ThemeAppearance = 'light' | 'dark';
