import { describe, expect, it } from 'vitest';
import { getReaderSettings, upsertReaderSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { getDefaultReaderSettings } from '@app/shared';

import { fetchReaderSettings } from './fetch-reader-settings.js';
import { saveReaderSettings } from './save-reader-settings.js';

describe('fetchReaderSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    const { db } = await createSqlJsHarness();
    const page = await fetchReaderSettings(db);
    expect(page.settings).toEqual(getDefaultReaderSettings());
  });

  it('loads persisted settings', async () => {
    const { db } = await createSqlJsHarness();
    const custom = {
      ...getDefaultReaderSettings(),
      readingMode: 'rtl' as const,
      preloadAhead: 4,
    };

    await upsertReaderSettings(db, custom);
    const page = await fetchReaderSettings(db);
    expect(page.settings).toEqual(custom);
  });
});

describe('saveReaderSettings', () => {
  it('persists validated settings', async () => {
    const { db } = await createSqlJsHarness();
    const next = {
      ...getDefaultReaderSettings(),
      readingMode: 'vertical' as const,
      lowMemoryMode: true,
      verticalGapPx: 16,
    };

    const result = await saveReaderSettings(db, next);
    expect(result.ok).toBe(true);
    expect(await getReaderSettings(db)).toEqual(next);
  });

  it('rejects invalid settings', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveReaderSettings(db, {
      ...getDefaultReaderSettings(),
      preloadAhead: -1,
    });
    expect(result.ok).toBe(false);
  });
});
