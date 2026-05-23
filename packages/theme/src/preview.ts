import type { ThemeDefinition } from '@app/design-system';
import type { ThemeSettings } from '@app/shared';

import { getThemePreset } from './presets.js';
import { resolveEffectiveDark } from './resolve-theme.js';

export function toThemePreviewDefinition(settings: ThemeSettings): ThemeDefinition {
  const preset = getThemePreset(settings.presetId);
  const dark = resolveEffectiveDark(settings);
  const tokens = dark ? preset.dark : preset.light;

  return {
    id: preset.id,
    name: preset.name,
    background: tokens.background,
    foreground: tokens.foreground,
    surface: tokens.surface,
    accent: tokens.accent,
    border: tokens.border,
    readerBackground: tokens.readerBackground,
    primary: tokens.primary,
    destructive: tokens.destructive,
    success: tokens.success,
    warning: tokens.warning,
  };
}

export function toThemePreviewDefinitionForPreset(
  presetId: string,
  previewDark: boolean,
): ThemeDefinition {
  return toThemePreviewDefinition({ presetId, dark: previewDark });
}
