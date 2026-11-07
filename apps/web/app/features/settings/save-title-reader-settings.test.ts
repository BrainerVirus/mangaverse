// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getReaderSettings, getTitleReaderSettingsLayers, upsertReaderSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { getDefaultReaderSettings } from '@app/shared';
import { saveReaderSettingsScope, saveTitleReaderSettings } from './save-title-reader-settings.js';

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

describe('saveReaderSettingsScope', () => {
  it('Given a title-scoped write, When saved, Then only the title row moves', async () => {
    const { db } = await createSqlJsHarness();
    const global = { ...getDefaultReaderSettings(), readingMode: 'ltr' as const };
    await upsertReaderSettings(db, global);

    await saveReaderSettingsScope(db, {
      scope: 'title',
      mangaId: 'manga-1',
      overrides: { readingMode: 'rtl' },
    });

    expect(await getReaderSettings(db)).toEqual(global);
    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'rtl' },
      settings: { readingMode: 'rtl' },
    });
  });

  it('Given a global-scoped write, When saved, Then only the global row moves', async () => {
    const { db } = await createSqlJsHarness();
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl', verticalGapPx: 16 });
    const before = await getTitleReaderSettingsLayers(db, 'manga-1');

    await saveReaderSettingsScope(db, {
      scope: 'global',
      settings: { ...getDefaultReaderSettings(), readingMode: 'vertical' },
    });

    expect((await getReaderSettings(db)).readingMode).toBe('vertical');
    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: before.overrides,
    });
  });

  it('Given two titles, When one title is written, Then the other title is untouched', async () => {
    const { db } = await createSqlJsHarness();
    await saveTitleReaderSettings(db, 'manga-2', { readingMode: 'ltr' });

    await saveReaderSettingsScope(db, {
      scope: 'title',
      mangaId: 'manga-1',
      overrides: { readingMode: 'rtl' },
    });

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'rtl' },
    });
    expect(await getTitleReaderSettingsLayers(db, 'manga-2')).toMatchObject({
      overrides: { readingMode: 'ltr' },
    });
  });

  it('Given a global write, When it lands, Then it does not rewrite any other title row', async () => {
    const { db } = await createSqlJsHarness();
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl' });
    await saveTitleReaderSettings(db, 'manga-2', { readingMode: 'ltr' });

    await saveReaderSettingsScope(db, {
      scope: 'global',
      settings: { ...getDefaultReaderSettings(), readingMode: 'vertical' },
    });

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'rtl' },
    });
    expect(await getTitleReaderSettingsLayers(db, 'manga-2')).toMatchObject({
      overrides: { readingMode: 'ltr' },
    });
  });

  it('Given a combined layers write, Then the global and title rows both move', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, getDefaultReaderSettings());
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl' });

    await saveReaderSettingsScope(db, {
      scope: 'layers',
      mangaId: 'manga-1',
      overrides: {},
      settings: { ...getDefaultReaderSettings(), readingMode: 'vertical' },
    });

    expect((await getReaderSettings(db)).readingMode).toBe('vertical');
    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({ overrides: {} });
  });

  it('Given a title write fails, Then the global row is unchanged', async () => {
    const { db } = await createSqlJsHarness();
    const global = { ...getDefaultReaderSettings(), readingMode: 'vertical' as const };
    await upsertReaderSettings(db, global);

    await expect(
      saveReaderSettingsScope(db, {
        scope: 'title',
        mangaId: 'manga-1',
        overrides: { preloadAhead: 20 },
      }),
    ).rejects.toThrow('preloadAhead must be between 0 and 10.');

    expect(await getReaderSettings(db)).toEqual(global);
  });

  it('Given a global write fails, Then the title row is unchanged', async () => {
    const { db } = await createSqlJsHarness();
    await saveTitleReaderSettings(db, 'manga-1', { readingMode: 'rtl' });

    await expect(
      saveReaderSettingsScope(db, {
        scope: 'global',
        settings: { ...getDefaultReaderSettings(), preloadAhead: 20 },
      }),
    ).rejects.toThrow('preloadAhead must be between 0 and 10.');

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: { readingMode: 'rtl' },
    });
  });
});
