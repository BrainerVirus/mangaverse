import type { AppDrizzleDb } from '@app/db';
import type { AppResult, ThemeDefinition } from '@app/shared';
import { createAppError, err } from '@app/shared';

import { normalizeThemeDefinition, validateThemeDefinition } from './theme-definition.js';
import { isCustomThemeId } from './validate-theme-settings.js';

/** Custom themes only: built-in presets resolve from code. */
export async function fetchThemeDefinitions(db: AppDrizzleDb): Promise<readonly ThemeDefinition[]> {
  const { listThemeDefinitions } = await import('@app/db');
  return listThemeDefinitions(db);
}

export async function fetchThemeDefinition(
  db: AppDrizzleDb,
  themeId: string,
): Promise<ThemeDefinition | undefined> {
  const { getThemeDefinition } = await import('@app/db');
  return getThemeDefinition(db, themeId);
}

/**
 * Validates, normalizes colors to OKLCH, then stores. Built-in ids are owned by code,
 * so a custom definition must use the `custom:` prefix.
 */
export async function saveThemeDefinition(
  db: AppDrizzleDb,
  input: unknown,
): Promise<AppResult<ThemeDefinition>> {
  const result = validateThemeDefinition(input);
  if (!result.ok) {
    return err(result.error);
  }
  if (!isCustomThemeId(result.value.id)) {
    return err(
      createAppError({
        code: 'theme.invalid',
        message: 'Custom theme ids must start with "custom:".',
      }),
    );
  }

  const { upsertThemeDefinition } = await import('@app/db');
  return upsertThemeDefinition(db, normalizeThemeDefinition(result.value));
}

export async function deleteThemeDefinition(
  db: AppDrizzleDb,
  themeId: string,
): Promise<AppResult<void>> {
  if (!isCustomThemeId(themeId)) {
    return err(
      createAppError({ code: 'theme.invalid', message: 'Built-in themes cannot be deleted.' }),
    );
  }
  const { deleteThemeDefinition: remove } = await import('@app/db');
  await remove(db, themeId);
  return { ok: true, value: undefined };
}
