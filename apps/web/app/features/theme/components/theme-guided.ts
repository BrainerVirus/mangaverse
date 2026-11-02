import { converter } from 'culori';
import type { ThemeDefinition, ThemeSeedTokenName, ThemeSeeds } from '@app/shared';
import { THEME_SEED_TOKEN_NAMES } from '@app/shared';

import {
  contrastRatio,
  formatOklch,
  getOklchLightness,
  mapToSrgbGamut,
  mixCssColors,
  parseThemeColor,
  withOklchLightness,
} from '../color.js';
import { deriveThemeVariables } from '../derive.js';
import type { ThemeAppearance } from '../tokens.js';

/** Both appearances share the editor; each has its own seeds and meters. */
export const GUIDED_APPEARANCES = ['light', 'dark'] as const satisfies readonly ThemeAppearance[];

/** WCAG floor the derivation targets for body text. */
export const BODY_TEXT_TARGET = 4.5;

const OKLCH_MAX_CHROMA = 0.37;
const LIGHTNESS_STEP = 0.01;
const LIGHTNESS_SEARCH_STEPS = 100;
const FIX_STEP = 0.02;
const FIX_SEARCH_STEPS = 25;
const SURFACE_WARMTH_MAX_CHROMA = 0.02;
const SURFACE_TINT_CHROMA = 0.04;
const SURFACE_WARMTH_MIX = 0.45;
const SURFACE_MAX_LIGHTNESS = 0.97;
const SURFACE_WARM_HUE = 70;
const SURFACE_COOL_HUE = 250;
const NEUTRAL_CHROMA = 0.0005;

/** The regular glass tiers `--*-glass` ink sits on (mirrors `derive.ts`). */
const REGULAR_GLASS = {
  light: { tint: '#ffffff', alpha: 0.68 },
  dark: { tint: '#141210', alpha: 0.66 },
} as const;

const toOklch = converter('oklch');

export interface GuidedOklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface GuidedSeedField {
  readonly name: ThemeSeedTokenName;
  readonly label: string;
  readonly description: string;
}

const SEED_COPY: Readonly<Record<ThemeSeedTokenName, { label: string; description: string }>> = {
  background: { label: 'Canvas', description: 'The page behind everything else.' },
  foreground: { label: 'Text', description: 'Body and heading ink on the canvas.' },
  accent: { label: 'Accent fill', description: 'Hover and selected fills, sidebar chips.' },
  primary: { label: 'Primary', description: 'High-emphasis buttons and brand surfaces.' },
  surface: { label: 'Surface', description: 'Cards, popovers and the sidebar.' },
  border: { label: 'Border', description: 'Borders, separators and inputs.' },
  readerBackground: { label: 'Reader canvas', description: 'Behind comic and manga pages.' },
  destructive: { label: 'Destructive', description: 'Errors and destructive actions.' },
  success: { label: 'Success', description: 'Confirmations and healthy states.' },
  warning: { label: 'Warning', description: 'Caution states.' },
};

/** Every editable seed, in storage order, with the copy the panel shows. */
export const GUIDED_SEED_FIELDS: readonly GuidedSeedField[] = THEME_SEED_TOKEN_NAMES.map(
  (name) => ({
    name,
    ...SEED_COPY[name],
  }),
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Reads any CSS Color 4 seed as OKLCH; `undefined` when the value is not a color. */
export function readGuidedOklch(value: string): GuidedOklch | undefined {
  const color = parseThemeColor(value);
  if (color === undefined) {
    return undefined;
  }
  const oklch = toOklch(color);
  return { l: oklch.l, c: oklch.c, h: oklch.h ?? 0 };
}

/** Writes one OKLCH channel of a seed, gamut-mapped so the stored value stays paintable. */
export function setSeedChannel(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  seed: ThemeSeedTokenName,
  patch: Partial<GuidedOklch>,
): ThemeDefinition {
  const seeds = definition[appearance].seeds;
  const current = readGuidedOklch(seeds[seed]);
  if (current === undefined) {
    return definition;
  }
  const value = formatOklch(
    clamp(patch.l ?? current.l, 0, 1),
    clamp(patch.c ?? current.c, 0, OKLCH_MAX_CHROMA),
    patch.h ?? current.h,
  );
  const nextSeeds: ThemeSeeds = { ...seeds, [seed]: mapToSrgbGamut(value) ?? value };
  return {
    ...definition,
    [appearance]: { ...definition[appearance], seeds: nextSeeds },
  };
}

/**
 * Warmth reads the surface's own chroma: 50 is neutral, above 50 leans warm
 * (hue 70), below 50 leans cool (hue 250).
 */
export function readSurfaceWarmth(seeds: ThemeSeeds): number {
  const oklch = readGuidedOklch(seeds.surface);
  if (oklch === undefined || oklch.c < NEUTRAL_CHROMA) {
    return 50;
  }
  const distance = clamp((oklch.c / SURFACE_WARMTH_MAX_CHROMA) * 50, 0, 50);
  return Math.round(clamp(oklch.h < 180 ? 50 + distance : 50 - distance, 0, 100));
}

export function withSurfaceWarmth(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  warmth: number,
): ThemeDefinition {
  const value = clamp(warmth, 0, 100);
  // Tint a neutral at the surface's own lightness so warmth never brightens a dark
  // surface. Pure white cannot carry chroma, so cap the neutral just below 1.
  const lightness = Math.min(
    getOklchLightness(definition[appearance].seeds.surface) ?? 0.5,
    SURFACE_MAX_LIGHTNESS,
  );
  const neutral = formatOklch(lightness, 0, 0);
  const amount = (Math.abs(value - 50) / 50) * SURFACE_WARMTH_MIX;
  const tint = formatOklch(
    lightness,
    SURFACE_TINT_CHROMA,
    value >= 50 ? SURFACE_WARM_HUE : SURFACE_COOL_HUE,
  );
  const surface = amount === 0 ? neutral : mixCssColors(neutral, tint, amount);
  return {
    ...definition,
    [appearance]: {
      ...definition[appearance],
      seeds: { ...definition[appearance].seeds, surface },
    },
  };
}

/** The current text contrast, one decimal, for the slider and its label. */
export function readTextContrast(seeds: ThemeSeeds): number {
  return round(contrastRatio(seeds.foreground, seeds.background) ?? 0);
}

function textDirectionFor(background: string): 'lighter' | 'darker' {
  const towardWhite = contrastRatio('#ffffff', background) ?? 0;
  const towardBlack = contrastRatio('#000000', background) ?? 0;
  return towardWhite > towardBlack ? 'lighter' : 'darker';
}

/**
 * Walks OKLCH lightness until the foreground reaches `target` from the requested
 * side. Lowering keeps the furthest step when the pair never crosses the target.
 */
function walkLightness(
  foreground: string,
  background: string,
  target: number,
  direction: 'lighter' | 'darker',
  raise: boolean,
): string | undefined {
  const base = getOklchLightness(foreground);
  if (base === undefined) {
    return undefined;
  }
  const delta = direction === 'lighter' ? 1 : -1;
  let furthest = foreground;
  let previous = { color: foreground, ratio: contrastRatio(foreground, background) ?? 0 };
  for (let step = 1; step <= LIGHTNESS_SEARCH_STEPS; step += 1) {
    const lightness = base + delta * step * LIGHTNESS_STEP;
    if (lightness < 0 || lightness > 1) {
      break;
    }
    const next = withOklchLightness(foreground, lightness);
    if (next === undefined) {
      break;
    }
    const mapped = mapToSrgbGamut(next);
    if (mapped === undefined) {
      break;
    }
    furthest = mapped;
    const ratio = contrastRatio(mapped, background) ?? 0;
    if (raise && ratio >= target) {
      return mapped;
    }
    if (!raise && ratio <= target) {
      return Math.abs(ratio - target) <= Math.abs(previous.ratio - target)
        ? mapped
        : previous.color;
    }
    previous = { color: mapped, ratio };
  }
  return raise ? undefined : furthest;
}

/** Moves the text seed until the canvas pair sits at the requested contrast level. */
export function withTextContrast(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  target: number,
): ThemeDefinition {
  const seeds = definition[appearance].seeds;
  const goal = clamp(target, 3, 7);
  const current = contrastRatio(seeds.foreground, seeds.background) ?? 0;
  const raise = current < goal;
  const away = textDirectionFor(seeds.background);
  const direction = raise ? away : away === 'lighter' ? 'darker' : 'lighter';
  const next = walkLightness(seeds.foreground, seeds.background, goal, direction, raise);
  if (next === undefined) {
    return definition;
  }
  return {
    ...definition,
    [appearance]: { ...definition[appearance], seeds: { ...seeds, foreground: next } },
  };
}

export type ContrastPairId =
  | 'text'
  | 'muted'
  | 'primary'
  | 'accent'
  | 'sidebar'
  | 'destructive-glass'
  | 'success-glass'
  | 'warning-glass';

export type ContrastStatus = 'strong' | 'good' | 'large' | 'fail';

export interface GuidedContrastPair {
  readonly id: ContrastPairId;
  readonly label: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly target: number;
  readonly passes: boolean;
  readonly status: ContrastStatus;
  readonly statusLabel: string;
  readonly fixHint: string;
}

export interface GuidedContrastFix {
  readonly definition: ThemeDefinition;
}

/** Plain-language reading of a WCAG ratio. */
export function describeContrast(ratio: number): { status: ContrastStatus; label: string } {
  if (ratio >= 7) {
    return { status: 'strong', label: 'Strong contrast' };
  }
  if (ratio >= BODY_TEXT_TARGET) {
    return { status: 'good', label: 'Easy to read' };
  }
  if (ratio >= 3) {
    return { status: 'large', label: 'Large text only' };
  }
  return { status: 'fail', label: 'Needs work' };
}

function regularGlassFill(background: string, dark: boolean): string {
  // shortcut: mirrors the regular glass tiers in derive.ts; export them from there
  // when the accessibility pass adds glass tuning to the advanced editor.
  const glass = dark ? REGULAR_GLASS.dark : REGULAR_GLASS.light;
  return mixCssColors(background, glass.tint, glass.alpha);
}

const PAIR_FIX_SEEDS: Readonly<Record<ContrastPairId, readonly ThemeSeedTokenName[]>> = {
  text: ['foreground'],
  muted: ['foreground', 'accent'],
  primary: ['primary'],
  accent: ['accent'],
  sidebar: ['surface'],
  'destructive-glass': ['destructive'],
  'success-glass': ['success'],
  'warning-glass': ['warning'],
};

const PAIR_FIX_HINTS: Readonly<Record<ContrastPairId, string>> = {
  text: 'Moves the text seed lighter or darker until this pair clears 4.5:1.',
  muted: 'Moves the text or accent seed until muted text clears 4.5:1.',
  primary: 'Moves the primary seed until its button text clears 4.5:1.',
  accent: 'Moves the accent seed until its text clears 4.5:1.',
  sidebar: 'Moves the surface seed until sidebar text clears 4.5:1.',
  'destructive-glass': 'Moves the destructive seed until the glass status clears 4.5:1.',
  'success-glass': 'Moves the success seed until the glass status clears 4.5:1.',
  'warning-glass': 'Moves the warning seed until the glass status clears 4.5:1.',
};

function makePair(
  id: ContrastPairId,
  label: string,
  foreground: string,
  background: string,
): GuidedContrastPair {
  const ratio = round(contrastRatio(foreground, background) ?? 0, 2);
  const { status, label: statusLabel } = describeContrast(ratio);
  return {
    id,
    label,
    foreground,
    background,
    ratio,
    target: BODY_TEXT_TARGET,
    passes: ratio >= BODY_TEXT_TARGET,
    status,
    statusLabel,
    fixHint: PAIR_FIX_HINTS[id],
  };
}

/**
 * Resolves the seed-derived pairs the editor paints. Advanced overrides are left
 * out on purpose: the guided tab only owns seeds, so its fixes always move a seed.
 */
export function buildContrastPairs(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
): readonly GuidedContrastPair[] {
  const variables = deriveThemeVariables(definition, appearance);
  const glass = regularGlassFill(variables['--background'], appearance === 'dark');

  return [
    makePair('text', 'Text on the canvas', variables['--foreground'], variables['--background']),
    makePair(
      'muted',
      'Muted text on the accent fill',
      variables['--muted-foreground'],
      variables['--muted'],
    ),
    makePair(
      'primary',
      'Primary button text',
      variables['--primary-foreground'],
      variables['--primary'],
    ),
    makePair('accent', 'Accent fill text', variables['--accent-foreground'], variables['--accent']),
    makePair('sidebar', 'Sidebar text', variables['--sidebar-foreground'], variables['--sidebar']),
    makePair(
      'destructive-glass',
      'Destructive glass status',
      variables['--destructive-glass'],
      glass,
    ),
    makePair('success-glass', 'Success glass status', variables['--success-glass'], glass),
    makePair('warning-glass', 'Warning glass status', variables['--warning-glass'], glass),
  ];
}

function pairRatio(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  id: ContrastPairId,
): number {
  return buildContrastPairs(definition, appearance).find((pair) => pair.id === id)?.ratio ?? 0;
}

function nudgeSeed(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  seed: ThemeSeedTokenName,
  pair: GuidedContrastPair,
  direction: 'lighter' | 'darker',
): ThemeDefinition | undefined {
  const base = readGuidedOklch(definition[appearance].seeds[seed]);
  if (base === undefined) {
    return undefined;
  }
  const delta = direction === 'lighter' ? 1 : -1;
  const initial = pairRatio(definition, appearance, pair.id);
  let best: { definition: ThemeDefinition; ratio: number } | undefined;

  for (let step = 1; step <= FIX_SEARCH_STEPS; step += 1) {
    const lightness = base.l + delta * step * FIX_STEP;
    if (lightness < 0 || lightness > 1) {
      break;
    }
    const next = setSeedChannel(definition, appearance, seed, { l: lightness });
    const ratio = pairRatio(next, appearance, pair.id);
    if (best === undefined || ratio > best.ratio) {
      best = { definition: next, ratio };
    }
    if (ratio >= pair.target) {
      return next;
    }
  }

  return best !== undefined && best.ratio > initial ? best.definition : undefined;
}

/**
 * One-click fix: walks the pair's seeds until the ratio clears 4.5:1 and returns
 * the new draft. The meter then shows the resulting ratio and status.
 */
export function fixContrastPair(
  definition: ThemeDefinition,
  appearance: ThemeAppearance,
  id: ContrastPairId,
): GuidedContrastFix | undefined {
  const pair = buildContrastPairs(definition, appearance).find((entry) => entry.id === id);
  if (pair === undefined || pair.passes) {
    return undefined;
  }

  for (const seed of PAIR_FIX_SEEDS[id]) {
    for (const direction of ['lighter', 'darker'] as const) {
      const next = nudgeSeed(definition, appearance, seed, pair, direction);
      if (next === undefined) {
        continue;
      }
      return { definition: next };
    }
  }

  return undefined;
}
