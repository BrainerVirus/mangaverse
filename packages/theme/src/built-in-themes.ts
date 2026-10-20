import type { ThemeDefinition, ThemeOverrides, ThemeSeeds } from '@app/shared';
import { THEME_DEFINITION_SCHEMA_VERSION } from '@app/shared';

import {
  THEME_PRESETS,
  type ThemeColorTokens,
  type ThemePresetDefinition,
  type ThemePresetId,
} from './presets.js';

/** The light neutral the shell has always used for muted text. */
const MUTED_FOREGROUND_LIGHT = '#71717a';
const MUTED_FOREGROUND_DARK = '#a1a1aa';
const LIGHT_NEUTRAL_INK = '#fafafa';

function seedsFromTokens(tokens: ThemeColorTokens): ThemeSeeds {
  return {
    background: tokens.background,
    foreground: tokens.foreground,
    accent: tokens.accent,
    primary: tokens.primary,
    surface: tokens.surface,
    border: tokens.border,
    readerBackground: tokens.readerBackground,
    destructive: tokens.destructive,
    success: tokens.success,
    warning: tokens.warning,
  };
}

/**
 * Built-ins keep the exact bytes shipped before the definition path. Every pinned
 * token is one where the accessible derivation intentionally differs from the
 * hand-tuned legacy value: muted text, the glass status shades and the primary ink
 * (the derivation raises the text target to 4.5:1; built-ins stay frozen).
 */
function legacyOverrides(tokens: ThemeColorTokens, dark: boolean): ThemeOverrides {
  return {
    '--muted-foreground': dark ? MUTED_FOREGROUND_DARK : MUTED_FOREGROUND_LIGHT,
    '--primary-foreground': dark ? tokens.background : LIGHT_NEUTRAL_INK,
    '--destructive-foreground': '#fafafa',
    '--destructive-glass': tokens.destructiveGlass,
    '--success-glass': tokens.successGlass,
    '--warning-glass': tokens.warningGlass,
  };
}

export function presetToThemeDefinition(preset: ThemePresetDefinition): ThemeDefinition {
  return {
    schemaVersion: THEME_DEFINITION_SCHEMA_VERSION,
    id: preset.id,
    name: preset.name,
    light: {
      seeds: seedsFromTokens(preset.light),
      overrides: legacyOverrides(preset.light, false),
    },
    dark: {
      seeds: seedsFromTokens(preset.dark),
      overrides: legacyOverrides(preset.dark, true),
    },
  };
}

const BUILT_IN_BY_ID = new Map(
  THEME_PRESETS.map((preset) => [preset.id, presetToThemeDefinition(preset)] as const),
);

export const BUILT_IN_THEME_DEFINITIONS: readonly ThemeDefinition[] = [...BUILT_IN_BY_ID.values()];

export function isBuiltInThemeId(value: string): value is ThemePresetId {
  return BUILT_IN_BY_ID.has(value as ThemePresetId);
}

/** Built-ins resolve from code; unknown ids fall back to the default theme. */
export function getBuiltInThemeDefinition(themeId: string): ThemeDefinition {
  return BUILT_IN_BY_ID.get(themeId as ThemePresetId) ?? BUILT_IN_BY_ID.get('default')!;
}
