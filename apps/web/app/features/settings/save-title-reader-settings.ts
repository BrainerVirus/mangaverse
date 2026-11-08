import type { AppDrizzleDb } from '@app/db';
import type { ReaderSettings, ReaderSettingsOverride } from '@app/shared';
import { saveReaderSettings } from './save-reader-settings.js';

/**
 * Every reader-settings surface uses this one mutation scope. The reader quick
 * panel and the settings page can both write the global row, so they must be
 * ordered against each other, not only against their own writes.
 */
export const READER_SETTINGS_MUTATION_SCOPE = 'reader-settings';

/** Persists one title's choices; title rows always apply on read. */
export async function saveTitleReaderSettings(
  db: AppDrizzleDb,
  mangaId: string,
  overrides: ReaderSettingsOverride,
): Promise<void> {
  const { upsertTitleReaderSettings } = await import('@app/db');
  const result = await upsertTitleReaderSettings(db, mangaId, overrides);
  if (!result.ok) throw new Error(result.error.message);
}

/** A field-level edit, so a full snapshot can never erase another surface's change. */
export type ReaderSettingsPatch = Partial<ReaderSettings>;

export type ReaderSettingsScopePatch =
  | {
      readonly scope: 'title';
      readonly mangaId: string;
      readonly patch: ReaderSettingsPatch;
    }
  | {
      readonly scope: 'global';
      readonly patch: ReaderSettingsPatch;
    }
  | {
      /** A global edit that also drops its keys from this title's choices. */
      readonly scope: 'layers';
      readonly mangaId: string;
      readonly patch: ReaderSettingsPatch;
    };

/**
 * Merges a field patch into the latest durable row, never a captured snapshot.
 * A reader edit and a settings-page edit to different fields therefore compose
 * instead of the later full-row write erasing the earlier one.
 */
export async function saveReaderSettingsPatch(
  db: AppDrizzleDb,
  write: ReaderSettingsScopePatch,
): Promise<void> {
  const { getReaderSettings, getTitleReaderSettingsLayers } = await import('@app/db');
  if (write.scope === 'title') {
    const layers = await getTitleReaderSettingsLayers(db, write.mangaId);
    await saveTitleReaderSettings(db, write.mangaId, { ...layers.overrides, ...write.patch });
    return;
  }

  const result = await saveReaderSettings(db, { ...(await getReaderSettings(db)), ...write.patch });
  if (!result.ok) throw new Error(result.error.message);
  if (write.scope === 'global') return;

  const layers = await getTitleReaderSettingsLayers(db, write.mangaId);
  const overrides: ReaderSettingsOverride = { ...layers.overrides };
  for (const key of Object.keys(write.patch) as (keyof ReaderSettings)[]) {
    delete overrides[key];
  }
  await saveTitleReaderSettings(db, write.mangaId, overrides);
}
