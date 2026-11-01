import type { AppDrizzleDb } from '@app/db';
import type { ReaderSettings } from '@app/shared';
import { saveReaderSettings } from './save-reader-settings.js';

/**
 * Persists a title-scoped edit. The title row is only read while the global
 * remember flag is on, so enabling it here prevents writing a row that
 * `getTitleReaderSettings` would ignore (edits vanishing and reset doing nothing).
 */
export async function saveTitleReaderSettings(
  db: AppDrizzleDb,
  mangaId: string,
  settings: ReaderSettings,
): Promise<void> {
  const { getReaderSettings, upsertTitleReaderSettings } = await import('@app/db');
  const global = await getReaderSettings(db);
  if (!global.rememberPerTitleOverrides) {
    const enabled = await saveReaderSettings(db, { ...global, rememberPerTitleOverrides: true });
    if (!enabled.ok) throw new Error(enabled.error.message);
  }

  const result = await upsertTitleReaderSettings(db, mangaId, settings);
  if (!result.ok) throw new Error(result.error.message);
}
