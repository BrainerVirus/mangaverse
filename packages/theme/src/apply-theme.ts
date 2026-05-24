import type { ThemeSettings } from '@app/shared';

import { resolveThemeAppearance, resolveThemeTokens } from './resolve-theme.js';

const CSS_VAR_KEYS = [
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
  '--destructive-foreground',
  '--success',
  '--warning',
  '--ring',
  '--reader-background',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-border',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
] as const;

export function buildThemeCssVariables(settings: ThemeSettings): Record<string, string> {
  const tokens = resolveThemeTokens(settings);
  const appearance = resolveThemeAppearance(settings);

  const primaryForeground = appearance === 'dark' ? tokens.background : '#fafafa';
  const accentForeground = tokens.foreground;
  const muted = tokens.accent;
  const mutedForeground = appearance === 'dark' ? '#a1a1aa' : '#71717a';

  return {
    '--background': tokens.background,
    '--foreground': tokens.foreground,
    '--muted': muted,
    '--muted-foreground': mutedForeground,
    '--popover': tokens.surface,
    '--popover-foreground': tokens.foreground,
    '--card': tokens.surface,
    '--card-foreground': tokens.foreground,
    '--border': tokens.border,
    '--input': tokens.border,
    '--primary': tokens.primary,
    '--primary-foreground': primaryForeground,
    '--secondary': tokens.accent,
    '--secondary-foreground': accentForeground,
    '--accent': tokens.accent,
    '--accent-foreground': accentForeground,
    '--destructive': tokens.destructive,
    '--destructive-foreground': '#fafafa',
    '--success': tokens.success,
    '--warning': tokens.warning,
    '--ring': tokens.primary,
    '--reader-background': tokens.readerBackground,
    '--sidebar': appearance === 'dark' ? tokens.surface : muted,
    '--sidebar-foreground': tokens.foreground,
    '--sidebar-border': tokens.border,
    '--sidebar-accent': tokens.accent,
    '--sidebar-accent-foreground': accentForeground,
  };
}

export function applyThemeToRoot(root: HTMLElement, settings: ThemeSettings): void {
  const appearance = resolveThemeAppearance(settings);
  const cssVariables = buildThemeCssVariables(settings);

  root.classList.remove('light', 'dark');
  root.classList.add(appearance);

  for (const key of CSS_VAR_KEYS) {
    root.style.setProperty(key, cssVariables[key] ?? '');
  }
}

export function clearAppliedTheme(root: HTMLElement): void {
  for (const key of CSS_VAR_KEYS) {
    root.style.removeProperty(key);
  }
}
