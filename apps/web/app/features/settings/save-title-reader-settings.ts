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

/**
 * One settings layer to persist. The scope is part of the write so a title edit
 * can never rewrite the global row from a captured snapshot, and a global edit
 * can never rewrite a stale title row.
 */
export type ReaderSettingsScopeWrite =
  | {
      readonly scope: 'title';
      readonly mangaId: string;
      readonly overrides: ReaderSettingsOverride;
    }
  | {
      readonly scope: 'global';
      readonly settings: ReaderSettings;
    }
  | {
      /** A global edit that also drops keys from this title's choices. */
      readonly scope: 'layers';
      readonly mangaId: string;
      readonly overrides: ReaderSettingsOverride;
      readonly settings: ReaderSettings;
    };

/**
 * Writes exactly the layer named by `write`. The caller schedules one write per
 * scope; a global edit that also drops some of this title's choices schedules a
 * second, title-scoped diff instead of folding both into one stale snapshot.
 */
export async function saveReaderSettingsScope(
  db: AppDrizzleDb,
  write: ReaderSettingsScopeWrite,
): Promise<void> {
  if (write.scope === 'title') {
    await saveTitleReaderSettings(db, write.mangaId, write.overrides);
    return;
  }
  if (write.scope === 'layers') {
    // One mutation settles both layers, so the caller invalidates once and the
    // cache never briefly refetches a half-written pair.
    const result = await saveReaderSettings(db, write.settings);
    if (!result.ok) throw new Error(result.error.message);
    await saveTitleReaderSettings(db, write.mangaId, write.overrides);
    return;
  }
  const result = await saveReaderSettings(db, write.settings);
  if (!result.ok) throw new Error(result.error.message);
}
