// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getReaderSettings, getTitleReaderSettingsLayers, upsertReaderSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { getDefaultReaderSettings } from '@app/shared';
import { saveReaderSettingsLayers, saveTitleReaderSettings } from './save-title-reader-settings.js';

describe('saveTitleReaderSettings', () => {
  it('Given a title edit, When saved, Then it applies on read without any global flag', async () => {
    const { db } = await createSqlJsHarness();

    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl' });

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'rtl' },
      settings: { readingMode: 'rtl' },
    });
  });

  it('Given an out-of-range value, When saved, Then the write throws', async () => {
    const { db } = await createSqlJsHarness();

    await expect(saveTitleReaderSettings(db, 'manga-1', { preloadAhead: 20 })).rejects.toThrow(
      'preloadAhead must be between 0 and 10.',
    );
  });
});

describe('saveReaderSettingsLayers', () => {
  it('Given an All titles change, When the snapshot is saved, Then the global row moves and the title keeps its own choices', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, getDefaultReaderSettings());
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl', verticalGapPx: 16 });

    await saveReaderSettingsLayers(db, 'manga-1', {
      globalSettings: { ...getDefaultReaderSettings(), readingMode: 'vertical' },
      titleOverrides: { verticalGapPx: 16 },
    });

    expect((await getReaderSettings(db)).readingMode).toBe('vertical');
    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { verticalGapPx: 16 },
      settings: { readingMode: 'vertical', verticalGapPx: 16 },
    });
  });
});
