import { describe, expect, it } from 'vitest';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import {
  appendSearchHistory,
  listSavedSearches,
  listSearchHistory,
  removeSavedSearch,
  upsertSavedSearch,
} from './search-history.js';

describe('search history', () => {
  it('Given a query searched twice, Then it lists once, newest first', async () => {
    const { db } = await createSqlJsHarness();
    await appendSearchHistory(db, { query: 'berserk' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await appendSearchHistory(db, { query: 'vagabond' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await appendSearchHistory(db, { query: 'Berserk' });

    const history = await listSearchHistory(db, 10);

    expect(history.map((entry) => entry.query)).toEqual(['Berserk', 'vagabond']);
  });

  it('Given more distinct queries than the limit, Then the cap still applies', async () => {
    const { db } = await createSqlJsHarness();
    for (const query of ['a', 'b', 'c']) {
      await appendSearchHistory(db, { query });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect((await listSearchHistory(db, 2)).map((entry) => entry.query)).toEqual(['c', 'b']);
  });
});

describe('saved searches', () => {
  it('persists query and filters, then lists them', async () => {
    const { db } = await createSqlJsHarness();

    const id = await upsertSavedSearch(db, {
      name: 'Action in English',
      query: 'berserk',
      filter: { language: 'en', includedTags: ['action'] },
    });

    expect(await listSavedSearches(db)).toMatchObject([
      {
        id,
        name: 'Action in English',
        query: 'berserk',
        filter: { language: 'en', includedTags: ['action'] },
      },
    ]);
  });

  it('updates an existing saved search in place instead of duplicating it', async () => {
    const { db } = await createSqlJsHarness();
    const id = await upsertSavedSearch(db, { name: 'Berserk', query: 'berserk' });

    await upsertSavedSearch(db, { id, name: 'Berserk', query: 'berserk deluxe' });

    const saved = await listSavedSearches(db);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe(id);
    expect(saved[0]?.query).toBe('berserk deluxe');
  });

  it('removes a saved search by id and reports whether it existed', async () => {
    const { db } = await createSqlJsHarness();
    const id = await upsertSavedSearch(db, { name: 'Berserk', query: 'berserk' });

    expect(await removeSavedSearch(db, id)).toBe(true);
    expect(await removeSavedSearch(db, id)).toBe(false);
    expect(await listSavedSearches(db)).toEqual([]);
  });
});
