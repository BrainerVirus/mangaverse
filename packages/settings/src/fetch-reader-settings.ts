import type { AppDrizzleDb } from '@app/db';

import type { ReaderSettingsPageData } from './types.js';

export async function fetchReaderSettings(db: AppDrizzleDb): Promise<ReaderSettingsPageData> {
  const { getReaderSettings } = await import('@app/db');
  const settings = await getReaderSettings(db);
  return { settings };
}
