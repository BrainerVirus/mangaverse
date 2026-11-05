import type { AppDrizzleDb } from '@app/db';
import type { ReaderSettings, ReaderSettingsOverride } from '@app/shared';
import { saveReaderSettings } from './save-reader-settings.js';

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

function sameSettings(a: ReaderSettings, b: ReaderSettings): boolean {
  return (Object.keys({ ...a, ...b }) as (keyof ReaderSettings)[]).every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
  );
}

/**
 * Persists the reader's settings after a scoped change (spec R7): the global
 * row when an "All titles" change moved it, then the title's choices. Writing
 * both from one snapshot keeps a coalesced burst that mixed scopes intact.
 */
export async function saveReaderSettingsLayers(
  db: AppDrizzleDb,
  mangaId: string,
  layers: {
    readonly globalSettings?: ReaderSettings | undefined;
    readonly titleOverrides?: ReaderSettingsOverride | undefined;
  },
): Promise<void> {
  const { getReaderSettings } = await import('@app/db');
  if (layers.globalSettings !== undefined) {
    const stored = await getReaderSettings(db);
    if (!sameSettings(stored, layers.globalSettings)) {
      const result = await saveReaderSettings(db, layers.globalSettings);
      if (!result.ok) throw new Error(result.error.message);
    }
  }
  await saveTitleReaderSettings(db, mangaId, layers.titleOverrides ?? {});
}
