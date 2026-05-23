import { describe, expect, it } from 'vitest';
import { getAppSettings, upsertAppSettings } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { getDefaultAppSettings } from '@app/shared';

import { fetchAppSettings } from './fetch-app-settings.js';
import { saveAppSettings } from './save-app-settings.js';

describe('fetchAppSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    const { db } = await createSqlJsHarness();
    const page = await fetchAppSettings(db);
    expect(page.settings).toEqual(getDefaultAppSettings());
  });

  it('loads persisted settings', async () => {
    const { db } = await createSqlJsHarness();
    const custom = {
      ...getDefaultAppSettings(),
      explicitContent: true,
      preferredLanguages: ['ja', 'en'],
    };

    await upsertAppSettings(db, custom);
    const page = await fetchAppSettings(db);
    expect(page.settings).toEqual(custom);
  });
});

describe('saveAppSettings', () => {
  it('persists validated settings', async () => {
    const { db } = await createSqlJsHarness();
    const next = {
      ...getDefaultAppSettings(),
      lowMemoryMode: true,
      locale: 'es',
    };

    const result = await saveAppSettings(db, next);
    expect(result.ok).toBe(true);
    expect(await getAppSettings(db)).toEqual(next);
  });

  it('rejects invalid settings', async () => {
    const { db } = await createSqlJsHarness();
    const result = await saveAppSettings(db, {
      ...getDefaultAppSettings(),
      preferredLanguages: ['not-a-language'],
    });
    expect(result.ok).toBe(false);
  });
});
