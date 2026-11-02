import type { AppDrizzleDb } from '@app/db';

import type { AppSettingsPageData } from './types.js';

export async function fetchAppSettings(db: AppDrizzleDb): Promise<AppSettingsPageData> {
  const { getAppSettings } = await import('@app/db');
  const settings = await getAppSettings(db);
  return { settings };
}
