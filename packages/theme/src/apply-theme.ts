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

/**
 * A preset carries one quiet fill (`accent`) but the shell paints three roles with it.
 * Blending the accent toward the preset's foreground keeps the secondary fill, the
 * sidebar chip and the hover fill distinguishable, and `--accent-foreground` readable
 * on all three. Values chosen so the closest pair still clears ΔE 12 (sRGB).
 */
const SECONDARY_MIX = 0.12;
const SIDEBAR_ACCENT_MIX = 0.24;

/** Mixes `from` toward `toward` by `amount` (0–1); anything but `#rrggbb` is returned as is. */
function mixHex(from: string, toward: string, amount: number): string {
  const channels = (value: string): number[] | null => {
    const match = /^#([0-9a-f]{6})$/i.exec(value);
    if (match === null) {
      return null;
    }
    const hex = match[1] ?? '';
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  };

  const source = channels(from);
  const target = channels(toward);
  if (source === null || target === null) {
    return from;
  }

  const mixed = source.map((channel, index) =>
    Math.round(channel + ((target[index] ?? channel) - channel) * amount),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function buildThemeCssVariables(settings: ThemeSettings): Record<string, string> {
  const tokens = resolveThemeTokens(settings);
  const appearance = resolveThemeAppearance(settings);

  const primaryForeground = appearance === 'dark' ? tokens.background : '#fafafa';
  const accentForeground = tokens.foreground;
  const muted = tokens.accent;
  const mutedForeground = appearance === 'dark' ? '#a1a1aa' : '#71717a';
  const secondary = mixHex(tokens.accent, tokens.foreground, SECONDARY_MIX);
  const sidebarAccent = mixHex(tokens.accent, tokens.foreground, SIDEBAR_ACCENT_MIX);

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
    '--secondary': secondary,
    '--secondary-foreground': accentForeground,
    '--accent': tokens.accent,
    '--accent-foreground': accentForeground,
    '--destructive': tokens.destructive,
    '--destructive-glass': tokens.destructiveGlass,
    '--destructive-foreground': '#fafafa',
    '--success': tokens.success,
    '--success-glass': tokens.successGlass,
    '--warning': tokens.warning,
    '--warning-glass': tokens.warningGlass,
    '--ring': tokens.primary,
    '--reader-background': tokens.readerBackground,
    '--sidebar': tokens.surface,
    '--sidebar-foreground': tokens.foreground,
    '--sidebar-border': tokens.border,
    '--sidebar-accent': sidebarAccent,
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
