// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toProviderId } from '@app/shared';
import type { AppDrizzleDb } from './adapter.js';
import { createMemoryPersistedBytesStore } from './persisted-bytes-store.js';
import { openPersistentDatabase, type PersistentDatabase } from './persistent-database.js';
import { addLibraryEntry, listLibraryEntryPage } from './repositories/library.js';
import { createMangaIdentityWithInitialMapping } from './repositories/identities.js';
import { createSqlJsHarness } from './testing/sqljs-harness.js';

/**
 * sql.js `export()` drops JS-registered SQL functions, so the persisted web database
 * only folds titles because `flush` registers them again. Binary order would put
 * "Zebra" before "apple" and miss "Éclair" from "éclair"; these tests pin the fold
 * through the real open path rather than calling the SQL functions directly.
 */
const TITLES = ['Zebra', 'Éclair', 'apple', 'Äpfel'] as const;
const TITLE_ORDER = ['Äpfel', 'apple', 'Éclair', 'Zebra'];

async function openOnMigratedStore() {
  const harness = await createSqlJsHarness();
  const store = createMemoryPersistedBytesStore();
  const open = (): Promise<PersistentDatabase> =>
    openPersistentDatabase({
      store,
      sqlModule: harness.sqlModule,
      // The stored snapshot is already migrated; an empty bundle only matters for a fresh file.
      migrations: { journal: { version: '0', dialect: 'sqlite', entries: [] }, files: [] },
    });
  const seeded = await store.write(harness.raw.export(), 0);
  expect(seeded).not.toBeNull();
  return { store, open };
}

/** Entries carry the manga id, not the title, so every read maps ids back through the seed. */
const titleByMangaId = new Map<string, string>();

function titleOf(mangaId: string): string {
  const title = titleByMangaId.get(mangaId);
  if (title === undefined) throw new Error(`unseeded manga ${mangaId}`);
  return title;
}

async function seedTitles(db: AppDrizzleDb): Promise<void> {
  for (const [index, title] of TITLES.entries()) {
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: title,
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-fold'),
      providerMangaId: `fold-${index}`,
      language: 'en',
    });
    if (!created.ok) throw new Error(`seed failed for ${title}`);
    titleByMangaId.set(created.value.mangaId, title);
    await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
  }
}

async function sortedTitles(db: AppDrizzleDb): Promise<string[]> {
  const page = await listLibraryEntryPage(db, {
    sort: { key: 'title', direction: 'asc' },
    limit: 50,
  });
  return page.items.map((entry) => titleOf(entry.mangaId));
}

async function foundTitles(db: AppDrizzleDb, query: string): Promise<string[]> {
  const page = await listLibraryEntryPage(db, { filter: { query }, limit: 50 });
  return page.items.map((entry) => titleOf(entry.mangaId));
}

describe('persisted database title fold', () => {
  it('Given a flush within one session, When the library sorts and searches, Then titles still fold', async () => {
    const { open } = await openOnMigratedStore();
    const session = await open();
    await seedTitles(session.db);

    expect((await session.flush()).status).toBe('saved');

    expect(await sortedTitles(session.db)).toEqual(TITLE_ORDER);
    expect(await foundTitles(session.db, 'éclair')).toEqual(['Éclair']);
    expect(await foundTitles(session.db, 'ÉCLAIR')).toEqual(['Éclair']);
    session.close();
  });

  it('Given titles flushed to the store, When the database is reopened from the stored bytes, Then titles still fold', async () => {
    const { open } = await openOnMigratedStore();
    const first = await open();
    await seedTitles(first.db);
    expect((await first.flush()).status).toBe('saved');
    first.close();

    const reopened = await open();
    expect(await sortedTitles(reopened.db)).toEqual(TITLE_ORDER);
    expect(await foundTitles(reopened.db, 'éclair')).toEqual(['Éclair']);
    expect(await foundTitles(reopened.db, 'ÉCLAIR')).toEqual(['Éclair']);

    // A second flush on the reopened handle drops the functions again.
    expect((await reopened.flush()).status).toBe('saved');
    expect(await sortedTitles(reopened.db)).toEqual(TITLE_ORDER);
    reopened.close();
  });
});
