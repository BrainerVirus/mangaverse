import type { ThemeDefinition as DesignSystemThemeDefinition } from '@app/design-system';
import type { ThemeDefinition, ThemeSettings } from '@app/shared';

import { getBuiltInThemeDefinition } from './built-in-themes.js';
import { resolveThemeAppearance } from './resolve-theme.js';

export function toThemePreviewDefinition(
  settings: ThemeSettings,
  definition?: ThemeDefinition,
): DesignSystemThemeDefinition {
  const resolved = definition ?? getBuiltInThemeDefinition(settings.themeId);
  const seeds = resolved[resolveThemeAppearance(settings)].seeds;

  return {
    id: resolved.id,
    name: resolved.name,
    background: seeds.background,
    foreground: seeds.foreground,
    surface: seeds.surface,
    accent: seeds.accent,
    border: seeds.border,
    readerBackground: seeds.readerBackground,
    primary: seeds.primary,
    destructive: seeds.destructive,
    success: seeds.success,
    warning: seeds.warning,
  };
}

export function toThemePreviewDefinitionForPreset(
  presetId: string,
  previewDark: boolean,
  definition?: ThemeDefinition,
): DesignSystemThemeDefinition {
  return toThemePreviewDefinition({ themeId: presetId, dark: previewDark }, definition);
}
