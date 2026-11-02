import type { ThemeDefinition, ThemeOverrides, ThemeSeeds } from '@app/shared';

import {
  contrastRatio,
  getOklchLightness,
  mapToSrgbGamut,
  mixCssColors,
  withOklchLightness,
} from './color.js';
import type { ThemeAppearance, ThemeCssVariable, ThemeCssVariables } from './tokens.js';

/** A preset carries one quiet fill (`accent`) but the shell paints three roles with it. */
const SECONDARY_MIX = 0.12;
const SIDEBAR_ACCENT_MIX = 0.24;

const LIGHT_NEUTRAL_INK = '#fafafa';
const WHITE = '#ffffff';
const BLACK = '#000000';

/** The regular glass tiers `--glass` composites over the canvas (DESIGN.md §3.4). */
const REGULAR_GLASS = {
  light: { tint: WHITE, alpha: 0.68 },
  dark: { tint: '#141210', alpha: 0.66 },
} as const;

const BODY_TEXT_CONTRAST = 4.5;
const UI_CONTRAST = 3;
const MIX_STEPS = 50;

/**
 * Walks a color's OKLCH lightness until it clears `target` against `background`.
 * Deterministic: the step is fixed and the loop stops at the first passing step.
 */
function ensureContrast(
  foreground: string,
  background: string,
  target: number,
  direction: 'darker' | 'lighter',
  prepare?: (value: string) => string | undefined,
): string {
  const prepared = prepare?.(foreground) ?? foreground;
  const initial = contrastRatio(prepared, background);
  if (initial === null || initial >= target) {
    return prepared;
  }

  const lightness = getOklchLightness(prepared);
  if (lightness === undefined) {
    return prepared;
  }

  for (let step = 1; step <= MIX_STEPS; step += 1) {
    const next = withOklchLightness(
      prepared,
      lightness + (direction === 'darker' ? -1 : 1) * step * 0.02,
    );
    if (next === undefined) {
      break;
    }
    const candidate = prepare?.(next) ?? next;
    const ratio = contrastRatio(candidate, background);
    if (ratio !== null && ratio >= target) {
      return candidate;
    }
  }

  const fallback = direction === 'darker' ? BLACK : WHITE;
  return fallback;
}

/** Lightens away from a dark backdrop and darkens away from a light one. */
function contrastDirection(background: string): 'darker' | 'lighter' {
  const towardWhite = contrastRatio(WHITE, background) ?? 0;
  const towardBlack = contrastRatio(BLACK, background) ?? 0;
  return towardWhite > towardBlack ? 'lighter' : 'darker';
}

/**
 * The theme's own ink is the design choice whenever it clears the floor. Otherwise
 * the highest-contrast candidate wins so a low-contrast seed cannot paint text the
 * same color as its fill. The last resort is the best candidate found.
 */
function readableOn(
  fill: string,
  seeds: Pick<ThemeSeeds, 'background' | 'foreground' | 'surface'>,
  target: number,
  preferred: string = seeds.foreground,
): string {
  const ratioOf = (color: string) => contrastRatio(color, fill) ?? 0;

  let best = preferred;
  let bestRatio = ratioOf(preferred);
  if (bestRatio >= target) {
    return best;
  }

  for (const candidate of [seeds.background, seeds.foreground, seeds.surface, WHITE, BLACK]) {
    const ratio = ratioOf(candidate);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

/** `--ring` keeps the primary hue but must clear 3:1 as a focus indicator. */
function ringColor(primary: string, background: string): string {
  return ensureContrast(primary, background, UI_CONTRAST, contrastDirection(background));
}

/** The regular glass fill a status color has to stay readable on. */
function regularGlassFill(background: string, dark: boolean): string {
  const glass = dark ? REGULAR_GLASS.dark : REGULAR_GLASS.light;
  return mixCssColors(background, glass.tint, glass.alpha);
}

/**
 * Status glass stays legible on the material: gamut-map the hue, then walk its
 * lightness against the regular glass fill in both appearances.
 */
function glassFill(base: string, background: string, dark: boolean): string {
  const fill = regularGlassFill(background, dark);
  return ensureContrast(base, fill, BODY_TEXT_CONTRAST, contrastDirection(fill), mapToSrgbGamut);
}

/**
 * Muted text walks from the canvas end back toward `foreground` and keeps the
 * largest background mix that still clears body-text contrast on the muted fill, so
 * it reads quieter than full-strength text. If even pure `foreground` misses the
 * floor, the highest contrast candidate stands in.
 */
function mutedForeground(seeds: ThemeSeeds): string {
  for (let step = MIX_STEPS; step >= 0; step -= 1) {
    const candidate = mixCssColors(seeds.foreground, seeds.background, step / MIX_STEPS);
    if ((contrastRatio(candidate, seeds.accent) ?? 0) >= BODY_TEXT_CONTRAST) {
      return candidate;
    }
  }
  return readableOn(seeds.accent, seeds, BODY_TEXT_CONTRAST);
}

/** Deterministic derivation for every non-seed token, before advanced overrides. */
export function deriveThemeVariables(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
): ThemeCssVariables {
  const { seeds } = definition[appearance];
  const dark = appearance === 'dark';
  const secondary = mixCssColors(seeds.accent, seeds.foreground, SECONDARY_MIX);
  const sidebarAccent = mixCssColors(seeds.accent, seeds.foreground, SIDEBAR_ACCENT_MIX);
  // The primary button flips ink with the appearance: a dark canvas uses the canvas
  // as ink, a light canvas uses the neutral near-white.
  const primaryInk = dark ? seeds.background : LIGHT_NEUTRAL_INK;

  return {
    '--background': seeds.background,
    '--foreground': seeds.foreground,
    '--muted': seeds.accent,
    '--muted-foreground': mutedForeground(seeds),
    '--popover': seeds.surface,
    '--popover-foreground': readableOn(seeds.surface, seeds, BODY_TEXT_CONTRAST),
    '--card': seeds.surface,
    '--card-foreground': readableOn(seeds.surface, seeds, BODY_TEXT_CONTRAST),
    '--border': seeds.border,
    '--input': seeds.border,
    '--primary': seeds.primary,
    '--primary-foreground': readableOn(seeds.primary, seeds, BODY_TEXT_CONTRAST, primaryInk),
    '--secondary': secondary,
    '--secondary-foreground': readableOn(secondary, seeds, BODY_TEXT_CONTRAST),
    '--accent': seeds.accent,
    '--accent-foreground': readableOn(seeds.accent, seeds, BODY_TEXT_CONTRAST),
    '--destructive': seeds.destructive,
    '--destructive-glass': glassFill(seeds.destructive, seeds.background, dark),
    '--destructive-foreground': readableOn(seeds.destructive, seeds, BODY_TEXT_CONTRAST),
    '--success': seeds.success,
    '--success-glass': glassFill(seeds.success, seeds.background, dark),
    '--warning': seeds.warning,
    '--warning-glass': glassFill(seeds.warning, seeds.background, dark),
    '--ring': ringColor(seeds.primary, seeds.background),
    '--reader-background': seeds.readerBackground,
    '--sidebar': seeds.surface,
    '--sidebar-foreground': readableOn(seeds.surface, seeds, BODY_TEXT_CONTRAST),
    '--sidebar-border': seeds.border,
    '--sidebar-accent': sidebarAccent,
    '--sidebar-accent-foreground': readableOn(sidebarAccent, seeds, BODY_TEXT_CONTRAST),
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
