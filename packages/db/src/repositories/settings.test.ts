import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDefaultReaderSettings } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { readerPreferences } from '../schema.js';
import {
  getReaderSettings,
  getTitleReaderSettings,
  getTitleReaderSettingsLayers,
  resetTitleReaderSettings,
  upsertReaderSettings,
  upsertTitleReaderSettings,
} from './settings.js';

const now = new Date().toISOString();

describe('reader settings rows', () => {
  it('Given a global row saved before #224, When reading it, Then its values stay and the row is not rewritten', async () => {
    const { db } = await createSqlJsHarness();
    const legacy = {
      ...getDefaultReaderSettings(),
      readingMode: 'ltr',
      pageLayout: 'single',
      fitMode: 'width',
      pageTransition: 'fade',
      preloadAhead: 2,
      verticalGapPx: 2000,
      brightness: 0.5,
      rememberPerTitleOverrides: false,
    } as Record<string, unknown>;
    delete legacy.preloadBehind;
    await db
      .insert(readerPreferences)
      .values({ id: 'global', settingsJson: legacy, updatedAt: now });

    const settings = await getReaderSettings(db);

    expect(settings).toMatchObject({
      readingMode: 'ltr',
      pageLayout: 'single',
      fitMode: 'width',
      pageTransition: 'fade',
      preloadAhead: 2,
      preloadBehind: 1,
      verticalGapPx: 64,
    });
    const row = db.select().from(readerPreferences).where(eq(readerPreferences.id, 'global')).get();
    expect(row?.settingsJson).toEqual(legacy);
  });

  it('Given a title row written while the remember flag was off, When reading the title, Then it applies', async () => {
    const { db } = await createSqlJsHarness();
    await db.insert(readerPreferences).values([
      {
        id: 'global',
        settingsJson: { ...getDefaultReaderSettings(), rememberPerTitleOverrides: false },
        updatedAt: now,
      },
      { id: 'title:manga-1', settingsJson: { readingMode: 'rtl' }, updatedAt: now },
    ]);

    expect((await getTitleReaderSettings(db, 'manga-1')).readingMode).toBe('rtl');
    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      global: { readingMode: 'auto' },
      overrides: { readingMode: 'rtl' },
      settings: { readingMode: 'rtl' },
    });
  });

  it('Given a title choice equal to the global mode, When saved, Then it stays an explicit title choice', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, { ...getDefaultReaderSettings(), readingMode: 'ltr' });

    const result = await upsertTitleReaderSettings(db, 'manga-1', {
      readingMode: 'ltr',
      verticalGapPx: 0,
    });

    expect(result.ok).toBe(true);
    expect((await getTitleReaderSettingsLayers(db, 'manga-1')).overrides).toEqual({
      readingMode: 'ltr',
    });
  });

  it('Given an out-of-range title value, When saved, Then the write is rejected', async () => {
    const { db } = await createSqlJsHarness();

    const result = await upsertTitleReaderSettings(db, 'manga-1', { verticalGapPx: 500 });

    expect(result.ok).toBe(false);
    expect((await getTitleReaderSettingsLayers(db, 'manga-1')).overrides).toEqual({});
  });

  it('Given a title row, When reset, Then the title reads the global settings again', async () => {
    const { db } = await createSqlJsHarness();
    await upsertTitleReaderSettings(db, 'manga-1', { readingMode: 'vertical' });

    await resetTitleReaderSettings(db, 'manga-1');

    expect(await getTitleReaderSettingsLayers(db, 'manga-1')).toMatchObject({
      overrides: {},
      settings: { readingMode: 'auto' },
    });
  });
});
