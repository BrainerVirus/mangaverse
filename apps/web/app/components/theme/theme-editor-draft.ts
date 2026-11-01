import type { ThemeDefinition, ThemeSettings } from '@app/shared';
import { createCustomThemeId, getBuiltInThemeDefinition, isBuiltInThemeId } from '@/features/theme';

export interface ThemeEditorDraft {
  readonly definition: ThemeDefinition;
  /** The draft is already stored in the themes table and can be deleted. */
  readonly isSaved: boolean;
}

/**
 * The editor always works on a custom definition: the selected custom theme when it
 * exists, otherwise a fresh copy of the selected built-in (or the default theme).
 */
export function createThemeEditorDraft(
  settings: ThemeSettings,
  customThemes: readonly ThemeDefinition[],
): ThemeEditorDraft {
  const existing = customThemes.find((definition) => definition.id === settings.themeId);
  if (existing !== undefined) {
    return { definition: existing, isSaved: true };
  }

  const basedOn = isBuiltInThemeId(settings.themeId) ? settings.themeId : 'default';
  const base = getBuiltInThemeDefinition(basedOn);

  return {
    definition: {
      ...base,
      id: createCustomThemeId(globalThis.crypto.randomUUID()),
      name: `${base.name} copy`,
      basedOn,
    },
    isSaved: false,
  };
}
