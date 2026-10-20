import type { ThemeDefinition, ThemeOverrides } from '@app/shared';

import { contrastRatio, getOklchLightness, mixCssColors, withOklchLightness } from './color.js';
import type { ThemeAppearance, ThemeCssVariable, ThemeCssVariables } from './tokens.js';

/** A preset carries one quiet fill (`accent`) but the shell paints three roles with it. */
const SECONDARY_MIX = 0.12;
const SIDEBAR_ACCENT_MIX = 0.24;

const LIGHT_NEUTRAL_INK = '#fafafa';
const DARK_NEUTRAL_INK = '#0a0a0a';
const MUTED_FOREGROUND_LIGHT = '#71717a';
const MUTED_FOREGROUND_DARK = '#a1a1aa';

const BODY_TEXT_CONTRAST = 4.5;
const UI_CONTRAST = 3;

/**
 * Walks a color's OKLCH lightness until it clears `target` against `background`.
 * Deterministic: the step is fixed and the loop stops at the first passing step.
 */
function ensureContrast(
  foreground: string,
  background: string,
  target: number,
  direction: 'darker' | 'lighter',
): string {
  const initial = contrastRatio(foreground, background);
  if (initial === null || initial >= target) {
    return foreground;
  }

  const lightness = getOklchLightness(foreground);
  if (lightness === undefined) {
    return foreground;
  }

  for (let step = 1; step <= 50; step += 1) {
    const next = lightness + (direction === 'darker' ? -1 : 1) * step * 0.02;
    const candidate = withOklchLightness(foreground, next);
    if (candidate === undefined) {
      break;
    }
    const ratio = contrastRatio(candidate, background);
    if (ratio !== null && ratio >= target) {
      return candidate;
    }
  }

  const fallback = direction === 'darker' ? '#000000' : '#ffffff';
  return fallback;
}

/** Picks the neutral ink with the highest contrast, then enforces the text target. */
function readableInk(background: string): string {
  const light = contrastRatio(LIGHT_NEUTRAL_INK, background) ?? 0;
  const dark = contrastRatio(DARK_NEUTRAL_INK, background) ?? 0;
  const prefersLight = light >= dark;
  const preferred = prefersLight ? LIGHT_NEUTRAL_INK : DARK_NEUTRAL_INK;
  const ratio = contrastRatio(preferred, background);
  if (ratio !== null && ratio >= BODY_TEXT_CONTRAST) {
    return preferred;
  }
  return ensureContrast(
    preferred,
    background,
    BODY_TEXT_CONTRAST,
    prefersLight ? 'lighter' : 'darker',
  );
}

function mutedForeground(accent: string, dark: boolean): string {
  const neutral = dark ? MUTED_FOREGROUND_DARK : MUTED_FOREGROUND_LIGHT;
  return ensureContrast(neutral, accent, BODY_TEXT_CONTRAST, dark ? 'lighter' : 'darker');
}

/**
 * The glass tier carries status text: keep the base hue but darken it on light
 * canvases until the label clears body-text contrast. Dark canvases keep the
 * status color, which is already tuned bright.
 */
function glassFill(base: string, background: string, dark: boolean): string {
  if (dark) {
    return base;
  }
  return ensureContrast(base, background, BODY_TEXT_CONTRAST, 'darker');
}

/**
 * The primary button flips ink with the appearance: a dark canvas uses the canvas
 * as ink, a light canvas uses the neutral near-white. The legacy bytes are exactly
 * this rule, and the 3:1 check keeps custom primaries usable.
 */
function primaryForeground(
  seeds: { readonly primary: string; readonly background: string },
  dark: boolean,
): string {
  const preferred = dark ? seeds.background : LIGHT_NEUTRAL_INK;
  const ratio = contrastRatio(preferred, seeds.primary);
  if (ratio !== null && ratio >= UI_CONTRAST) {
    return preferred;
  }
  const alternate = dark ? LIGHT_NEUTRAL_INK : DARK_NEUTRAL_INK;
  return ensureContrast(alternate, seeds.primary, UI_CONTRAST, dark ? 'lighter' : 'darker');
}

/** Deterministic derivation for every non-seed token, before advanced overrides. */
export function deriveThemeVariables(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
): ThemeCssVariables {
  const { seeds } = definition[appearance];
  const dark = appearance === 'dark';

  return {
    '--background': seeds.background,
    '--foreground': seeds.foreground,
    '--muted': seeds.accent,
    '--muted-foreground': mutedForeground(seeds.accent, dark),
    '--popover': seeds.surface,
    '--popover-foreground': seeds.foreground,
    '--card': seeds.surface,
    '--card-foreground': seeds.foreground,
    '--border': seeds.border,
    '--input': seeds.border,
    '--primary': seeds.primary,
    '--primary-foreground': primaryForeground(seeds, dark),
    '--secondary': mixCssColors(seeds.accent, seeds.foreground, SECONDARY_MIX),
    '--secondary-foreground': seeds.foreground,
    '--accent': seeds.accent,
    '--accent-foreground': seeds.foreground,
    '--destructive': seeds.destructive,
    '--destructive-glass': glassFill(seeds.destructive, seeds.background, dark),
    '--destructive-foreground': readableInk(seeds.destructive),
    '--success': seeds.success,
    '--success-glass': glassFill(seeds.success, seeds.background, dark),
    '--warning': seeds.warning,
    '--warning-glass': glassFill(seeds.warning, seeds.background, dark),
    '--ring': seeds.primary,
    '--reader-background': seeds.readerBackground,
    '--sidebar': seeds.surface,
    '--sidebar-foreground': seeds.foreground,
    '--sidebar-border': seeds.border,
    '--sidebar-accent': mixCssColors(seeds.accent, seeds.foreground, SIDEBAR_ACCENT_MIX),
    '--sidebar-accent-foreground': seeds.foreground,
  };
}

/** Applies a definition's advanced per-token overrides on top of the derivation. */
export function applyThemeOverrides(
  variables: ThemeCssVariables,
  overrides: ThemeOverrides | undefined,
): ThemeCssVariables {
  if (overrides === undefined) {
    return variables;
  }

  const next: Partial<Record<ThemeCssVariable, string>> = { ...variables };
  for (const [token, value] of Object.entries(overrides)) {
    next[token as ThemeCssVariable] = value;
  }
  return next as ThemeCssVariables;
}

export function buildThemeCssVariablesForDefinition(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
): ThemeCssVariables {
  const derived = deriveThemeVariables(definition, appearance);
  return applyThemeOverrides(derived, definition[appearance].overrides);
}
