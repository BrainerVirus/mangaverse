import type { AppDrizzleDb } from '@app/db';
import type { AppResult, ThemeSettings } from '@app/shared';

import { validateThemeSettings } from './validate-theme-settings.js';

export async function saveThemeSettings(db: AppDrizzleDb, settings: ThemeSettings): Promise<AppResult<void>> {
  const parsed = validateThemeSettings(settings);
  if (!parsed.ok) {
    return parsed;
  }

  const { upsertThemeSettings } = await import('@app/db');
  await upsertThemeSettings(db, parsed.value);
  return { ok: true, value: undefined };
}
