import { describe, expect, it } from 'vitest';
import {
  toCategoryId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  type LibraryEntryId,
} from '@app/shared';
import { createSqlJsHarness, type SqlJsHarness } from '../testing/sqljs-harness.js';
import { createMangaIdentityWithInitialMapping } from './identities.js';
import {
  addLibraryEntriesToCategories,
  addLibraryEntry,
  createLibraryCategory,
  deleteLibraryCategory,
  getLibraryEntry,
  listLibraryCategories,
  listLibraryEntries,
  listLibraryProviderIds,
  removeLibraryEntriesFromCategories,
  reorderLibraryCategories,
  setLibraryCategoryPinned,
  setLibraryEntriesFavorite,
  setLibraryEntriesStatus,
  updateLibraryCategory,
} from './library.js';

async function createManga(
  db: SqlJsHarness['db'],
  providerMangaId: string,
  providerId = 'prov-a',
  canonicalTitle = `Series ${providerMangaId}`,
) {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId(providerId),
    providerMangaId,
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.mangaId;
}

async function entryFor(
  harness: SqlJsHarness,
  remoteId: string,
  options: {
    providerId?: string;
    title?: string;
    status?: 'reading' | 'completed' | 'planned';
    favorite?: boolean;
    addedAt?: string;
    updatedAt?: string;
  } = {},
): Promise<LibraryEntryId> {
  const mangaId = await createManga(harness.db, remoteId, options.providerId, options.title);
  const entryId = toLibraryEntryId(`entry-${remoteId}`);
  await addLibraryEntry(harness.db, {
    mangaId,
    id: entryId,
    status: options.status ?? 'reading',
  });
  if (options.favorite === true) await setLibraryEntriesFavorite(harness.db, [entryId], true);
  if (options.addedAt !== undefined || options.updatedAt !== undefined) {
    harness.raw.run('UPDATE library_entries SET added_at = ?, updated_at = ? WHERE id = ?', [
      options.addedAt ?? null,
      options.updatedAt ?? null,
      entryId,
    ]);
  }
  return entryId;
}

describe('listLibraryEntries filters', () => {
  it('Given category, status, favorites and provider filters, Then they all combine', async () => {
    const harness = await createSqlJsHarness();
    const match = await entryFor(harness, 'match', {
      providerId: 'prov-a',
      status: 'reading',
      favorite: true,
    });
    const wrongStatus = await entryFor(harness, 'status', {
      providerId: 'prov-a',
      status: 'completed',
      favorite: true,
    });
    const wrongProvider = await entryFor(harness, 'provider', {
      providerId: 'prov-b',
      status: 'reading',
      favorite: true,
    });
    const wrongFavorite = await entryFor(harness, 'favorite', {
      providerId: 'prov-a',
      status: 'reading',
      favorite: false,
    });
    const noCategory = await entryFor(harness, 'category', {
      providerId: 'prov-a',
      status: 'reading',
      favorite: true,
    });

    const category = await createLibraryCategory(harness.db, { name: 'Priority' });
    expect(category.ok).toBe(true);
    if (!category.ok) return;
    const assignment = await addLibraryEntriesToCategories(
      harness.db,
      [match, wrongStatus, wrongProvider, wrongFavorite],
      [category.value],
    );
    expect(assignment.ok).toBe(true);

    const filtered = await listLibraryEntries(harness.db, {
      filter: {
        categoryIds: [category.value],
        statuses: ['reading'],
        favoritesOnly: true,
        providerIds: [toProviderId('prov-a')],
      },
    });
    expect(filtered.map((entry) => entry.id)).toEqual([match]);
    expect(filtered.map((entry) => entry.id)).not.toContain(noCategory);
  });

  it('Given titles whose ids and titles sort differently, Then title sort uses the canonical title', async () => {
    const harness = await createSqlJsHarness();
    const first = await createManga(harness.db, 'a', 'prov-a', 'Zulu');
    const second = await createManga(harness.db, 'b', 'prov-a', 'Alpha');
    // Force ids whose lexical order is the opposite of the title order.
    harness.raw.run('UPDATE manga_identities SET id = ? WHERE id = ?', ['zz-id', first]);
    harness.raw.run('UPDATE manga_identities SET id = ? WHERE id = ?', ['aa-id', second]);
    await addLibraryEntry(harness.db, { mangaId: toMangaId('zz-id'), status: 'reading' });
    await addLibraryEntry(harness.db, { mangaId: toMangaId('aa-id'), status: 'reading' });

    const ascending = await listLibraryEntries(harness.db, {
      sort: { key: 'title', direction: 'asc' },
    });
    expect(ascending.map((entry) => entry.mangaId)).toEqual([
      toMangaId('aa-id'),
      toMangaId('zz-id'),
    ]);

    const descending = await listLibraryEntries(harness.db, {
      sort: { key: 'title', direction: 'desc' },
    });
    expect(descending.map((entry) => entry.mangaId)).toEqual([
      toMangaId('zz-id'),
      toMangaId('aa-id'),
    ]);
  });

  it('Given date_added and last_updated, Then both sort in either direction with empty values last', async () => {
    const harness = await createSqlJsHarness();
    await entryFor(harness, 'old', {
      addedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    await entryFor(harness, 'new', {
      addedAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
    const empty = await entryFor(harness, 'empty');
    harness.raw.run('UPDATE library_entries SET added_at = NULL, updated_at = NULL WHERE id = ?', [
      empty,
    ]);

    const byAdded = await listLibraryEntries(harness.db, {
      sort: { key: 'date_added', direction: 'desc' },
    });
    expect(byAdded.map((entry) => entry.id)).toEqual([
      toLibraryEntryId('entry-new'),
      toLibraryEntryId('entry-old'),
      empty,
    ]);

    const byUpdated = await listLibraryEntries(harness.db, {
      sort: { key: 'last_updated', direction: 'asc' },
    });
    expect(byUpdated.map((entry) => entry.id)).toEqual([
      toLibraryEntryId('entry-old'),
      toLibraryEntryId('entry-new'),
      empty,
    ]);

    const addedAscending = await listLibraryEntries(harness.db, {
      sort: { key: 'date_added', direction: 'asc' },
    });
    expect(addedAscending.at(-1)?.id).toBe(empty);
  });

  it('lists the providers present in the library for the toolbar', async () => {
    const harness = await createSqlJsHarness();
    await entryFor(harness, 'a', { providerId: 'prov-b' });
    await entryFor(harness, 'b', { providerId: 'prov-a' });
    await entryFor(harness, 'c', { providerId: 'prov-b' });

    expect(await listLibraryProviderIds(harness.db)).toEqual([
      toProviderId('prov-a'),
      toProviderId('prov-b'),
    ]);
  });
});

describe('library category CRUD', () => {
  it('creates, renames, reorders, pins and deletes categories with duplicate and empty guards', async () => {
    const harness = await createSqlJsHarness();
    const first = await createLibraryCategory(harness.db, { name: '  Action  ', color: '#f00' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect((await createLibraryCategory(harness.db, { name: 'action' })).ok).toBe(false);
    expect((await createLibraryCategory(harness.db, { name: '   ' })).ok).toBe(false);

    const second = await createLibraryCategory(harness.db, { name: 'Drama' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const renamed = await updateLibraryCategory(harness.db, first.value, {
      name: 'Adventure',
      color: '#0f0',
    });
    expect(renamed.ok).toBe(true);

    const entryId = await entryFor(harness, 'member');
    await addLibraryEntriesToCategories(harness.db, [entryId], [first.value]);

    const pinned = await setLibraryCategoryPinned(harness.db, second.value, true);
    expect(pinned.ok).toBe(true);

    let categories = await listLibraryCategories(harness.db);
    expect(categories.map((category) => category.name)).toEqual(['Drama', 'Adventure']);
    expect(categories[0]?.pinned).toBe(true);
    expect(categories[1]?.color).toBe('#0f0');

    const reorder = await reorderLibraryCategories(harness.db, [first.value, second.value]);
    expect(reorder.ok).toBe(true);
    expect((await reorderLibraryCategories(harness.db, [first.value])).ok).toBe(false);

    // Pinning keeps presentation order primary; the stored indices are updated underneath.
    categories = await listLibraryCategories(harness.db);
    expect(categories.map((category) => category.name)).toEqual(['Drama', 'Adventure']);
    expect(categories.map((category) => category.sortIndex)).toEqual([1, 0]);

    const removed = await deleteLibraryCategory(harness.db, first.value);
    expect(removed.ok).toBe(true);
    expect((await listLibraryCategories(harness.db)).map((category) => category.name)).toEqual([
      'Drama',
    ]);
    expect((await getLibraryEntry(harness.db, entryId))?.categoryIds).toEqual([]);
    expect((await deleteLibraryCategory(harness.db, first.value)).ok).toBe(false);
  });

  it('assigns and removes categories in bulk and updates status and favorites', async () => {
    const harness = await createSqlJsHarness();
    const one = await entryFor(harness, 'one');
    const two = await entryFor(harness, 'two');
    const category = await createLibraryCategory(harness.db, { name: 'Bulk' });
    expect(category.ok).toBe(true);
    if (!category.ok) return;

    expect((await addLibraryEntriesToCategories(harness.db, [one, two], [category.value])).ok).toBe(
      true,
    );
    expect((await getLibraryEntry(harness.db, one))?.categoryIds).toEqual([category.value]);

    expect((await removeLibraryEntriesFromCategories(harness.db, [one], [category.value])).ok).toBe(
      true,
    );
    expect((await getLibraryEntry(harness.db, one))?.categoryIds).toEqual([]);
    expect((await getLibraryEntry(harness.db, two))?.categoryIds).toEqual([category.value]);

    expect((await setLibraryEntriesStatus(harness.db, [one, two], 'completed')).ok).toBe(true);
    expect((await getLibraryEntry(harness.db, one))?.status).toBe('completed');
    expect((await setLibraryEntriesFavorite(harness.db, [one, two], true)).ok).toBe(true);
    expect((await getLibraryEntry(harness.db, two))?.favorite).toBe(true);

    expect(
      (
        await addLibraryEntriesToCategories(
          harness.db,
          [toLibraryEntryId('missing')],
          [category.value],
        )
      ).ok,
    ).toBe(false);
    expect(
      (await addLibraryEntriesToCategories(harness.db, [one], [toCategoryId('missing')])).ok,
    ).toBe(false);
  });
});

describe('pinned category persistence', () => {
  it('survives a repository reload from the same database', async () => {
    const harness = await createSqlJsHarness();
    const category = await createLibraryCategory(harness.db, { name: 'Pinned' });
    expect(category.ok).toBe(true);
    if (!category.ok) return;
    await setLibraryCategoryPinned(harness.db, category.value, true);

    const reloaded = await listLibraryCategories(harness.db);
    expect(reloaded[0]).toMatchObject({ name: 'Pinned', pinned: true });
  });
});
