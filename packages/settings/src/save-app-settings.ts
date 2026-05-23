import type { AppDrizzleDb } from '@app/db';
import type { AppResult, AppSettings } from '@app/shared';

export async function saveAppSettings(db: AppDrizzleDb, settings: AppSettings): Promise<AppResult<void>> {
  const { upsertAppSettings } = await import('@app/db');
  return upsertAppSettings(db, settings);
}
