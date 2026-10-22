import { describe, expect, it } from 'vitest';
import {
  getReaderSettings,
  getTitleReaderSettings,
  resetTitleReaderSettings,
  upsertReaderSettings,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { getDefaultReaderSettings } from '@app/shared';
import { saveTitleReaderSettings } from './save-title-reader-settings.js';

describe('saveTitleReaderSettings', () => {
  it('Given global per-title overrides off, When a title edit is saved, Then the flag turns on and the title row is read back', async () => {
    const { db } = await createSqlJsHarness();
    await upsertReaderSettings(db, {
      ...getDefaultReaderSettings(),
      rememberPerTitleOverrides: false,
    });

    await saveTitleReaderSettings(db, 'manga-1', {
      ...getDefaultReaderSettings(),
      readingMode: 'rtl',
      rememberPerTitleOverrides: true,
    });

    expect((await getReaderSettings(db)).rememberPerTitleOverrides).toBe(true);
    expect(await getTitleReaderSettings(db, 'manga-1')).toMatchObject({
      readingMode: 'rtl',
      rememberPerTitleOverrides: true,
    });

    await resetTitleReaderSettings(db, 'manga-1');
    expect(await getTitleReaderSettings(db, 'manga-1')).toMatchObject({
      readingMode: 'ltr',
      rememberPerTitleOverrides: true,
    });
  });
});
