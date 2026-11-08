// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getReaderSettings, getTitleReaderSettingsLayers, upsertReaderSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { getDefaultReaderSettings } from '@app/shared';
import { saveReaderSettingsPatch, saveTitleReaderSettings } from './save-title-reader-settings.js';

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

describe('saveReaderSettingsPatch', () => {
  it('Given a title patch, When saved, Then only the patched fields move and other overrides stay', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, getDefaultReaderSettings());
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl', verticalGapPx: 16 });

    await saveReaderSettingsPatch(db, {
      scope: 'title',
      mangaId: 'manga-1',
      patch: { readingMode: 'ltr' },
    });

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'ltr', verticalGapPx: 16 },
    });
  });

  it('Given a global patch, When saved, Then other durable fields are preserved', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, {
      ...getDefaultReaderSettings(),
      readingMode: 'ltr',
      pageTransition: 'slide',
    });

    await saveReaderSettingsPatch(db, { scope: 'global', patch: { readingMode: 'vertical' } });

    expect(await getReaderSettings(db)).toMatchObject({
      readingMode: 'vertical',
      pageTransition: 'slide',
    });
  });

  it('Given two titles, When one title is patched, Then the other title is untouched', async () => {
    const { db } = await createSqlJsHarness();
    await saveTitleReaderSettings(db, 'manga-2', { readingMode: 'ltr' });

    await saveReaderSettingsPatch(db, {
      scope: 'title',
      mangaId: 'manga-1',
      patch: { readingMode: 'rtl' },
    });

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'rtl' },
    });
    expect(await getTitleReaderSettingsLayers(db, 'manga-2')).toMatchObject({
      overrides: { readingMode: 'ltr' },
    });
  });

  it('Given a layers patch, Then the global field moves and only its title keys are dropped', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, getDefaultReaderSettings());
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl', verticalGapPx: 16 });

    await saveReaderSettingsPatch(db, {
      scope: 'layers',
      mangaId: 'manga-1',
      patch: { readingMode: 'vertical' },
    });

    expect((await getReaderSettings(db)).readingMode).toBe('vertical');
    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { verticalGapPx: 16 },
    });
  });

  it('Given a global patch with an invalid value, Then the global row is unchanged', async () => {
    const { db } = await createSqlJsHarness();
    const global = { ...getDefaultReaderSettings(), readingMode: 'vertical' as const };
    await upsertReaderSettings(db, global);

    await expect(
      saveReaderSettingsPatch(db, { scope: 'global', patch: { preloadAhead: 20 } }),
    ).rejects.toThrow('preloadAhead must be between 0 and 10.');

    expect(await getReaderSettings(db)).toEqual(global);
  });
});
