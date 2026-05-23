import type { AppDrizzleDb } from '@app/db';
import type { AppResult, ReaderSettings } from '@app/shared';

export async function saveReaderSettings(db: AppDrizzleDb, settings: ReaderSettings): Promise<AppResult<void>> {
  const { upsertReaderSettings } = await import('@app/db');
  return upsertReaderSettings(db, settings);
}
