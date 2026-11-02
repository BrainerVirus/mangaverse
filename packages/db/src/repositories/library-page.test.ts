// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  toCategoryId,
  toLibraryEntryId,
  toMangaId,
  toProviderId,
  type LibraryEntryId,
  type LibraryFilter,
  type LibrarySort,
  type LibrarySortKey,
} from '@app/shared';
import { createSqlJsHarness, type SqlJsHarness } from '../testing/sqljs-harness.js';
import { addProviderMapping, createMangaIdentityWithInitialMapping } from './identities.js';
import {
  addLibraryEntriesToCategories,
  addLibraryEntry,
  createLibraryCategory,
  listLibraryEntries,
  listLibraryEntryPage,
  setLibraryEntriesFavorite,
  setLibraryEntriesStatus,
  setLibraryEntryActiveProviderMapping,
} from './library.js';

/**
 * The old JS pipeline, kept here as an independent reference: SQLite orders text by
 * binary value, so fixtures stay ASCII and every expected order comes from this code.
 */
interface ReferenceRow {
  readonly id: string;
  readonly mangaId: string;
  readonly title: string;
  readonly alternativeTitles: readonly string[];
  readonly favorite: boolean;
  readonly status: string;
  readonly unread: number;
  readonly progress: number | null;
  readonly addedAt: string | null;
  readonly updatedAt: string | null;
  readonly lastReadAt: string;
  readonly providerIds: readonly string[];
  readonly activeProviderMappingId: string | null;
  readonly defaultProviderMappingId: string;
  readonly categoryIds: readonly string[];
}

function rowsOf(raw: SqlJsHarness['raw'], sql: string): unknown[][] {
  return raw.exec(sql)[0]?.values ?? [];
}

function referenceRows(harness: SqlJsHarness): ReferenceRow[] {
  const { raw } = harness;
  const providerByMappingId = new Map<string, string>();
  const firstProviderByMangaId = new Map<string, string>();
  const providersByMangaId = new Map<string, string[]>();
  for (const value of rowsOf(
    raw,
    'SELECT id, provider_id, manga_id FROM manga_provider_mappings ORDER BY rowid',
  )) {
    const [id, providerId, mangaId] = value as [string, string, string];
    providerByMappingId.set(id, providerId);
    if (!firstProviderByMangaId.has(mangaId)) firstProviderByMangaId.set(mangaId, providerId);
    const list = providersByMangaId.get(mangaId) ?? [];
    list.push(providerId);
    providersByMangaId.set(mangaId, list);
  }
  const readAtByMangaId = new Map<string, string>();
  for (const value of rowsOf(
    raw,
    'SELECT manga_id, MAX(updated_at) FROM chapter_read_state GROUP BY manga_id',
  )) {
    const [mangaId, readAt] = value as [string, string];
    readAtByMangaId.set(mangaId, readAt);
  }
  const titlesByMangaId = new Map<string, string[]>();
  for (const value of rowsOf(raw, 'SELECT manga_id, value FROM manga_titles ORDER BY value')) {
    const [mangaId, title] = value as [string, string];
    const list = titlesByMangaId.get(mangaId) ?? [];
    list.push(title);
    titlesByMangaId.set(mangaId, list);
  }
  const categoriesByEntryId = new Map<string, string[]>();
  for (const value of rowsOf(
    raw,
    'SELECT library_entry_id, category_id FROM library_category_memberships ORDER BY category_id',
  )) {
    const [entryId, categoryId] = value as [string, string];
    const list = categoriesByEntryId.get(entryId) ?? [];
    list.push(categoryId);
    categoriesByEntryId.set(entryId, list);
  }

  return rowsOf(
    raw,
    `SELECT le.id, le.manga_id, mi.canonical_title, le.favorite, le.status,
            le.unread_count, le.progress_percent, le.added_at, le.updated_at,
            le.last_read_chapter_id, le.active_provider_mapping_id,
            mi.default_provider_mapping_id
     FROM library_entries le
     JOIN manga_identities mi ON mi.id = le.manga_id
     ORDER BY le.id`,
  ).map((value) => {
    const [
      id,
      mangaId,
      title,
      favorite,
      status,
      unread,
      progress,
      addedAt,
      updatedAt,
      lastReadChapterId,
      activeProviderMappingId,
      defaultProviderMappingId,
    ] = value as [
      string,
      string,
      string,
      number,
      string,
      number,
      number | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string,
    ];
    const readAt = readAtByMangaId.get(mangaId) ?? '';
    const hasResume = lastReadChapterId !== null && lastReadChapterId !== '';
    return {
      id,
      mangaId,
      title,
      alternativeTitles: titlesByMangaId.get(mangaId) ?? [],
      favorite: favorite === 1,
      status,
      unread,
      progress,
      addedAt,
      updatedAt,
      lastReadAt: readAt !== '' ? readAt : hasResume ? (updatedAt ?? '') : '',
      providerIds: providersByMangaId.get(mangaId) ?? [],
      activeProviderMappingId,
      defaultProviderMappingId,
      categoryIds: categoriesByEntryId.get(id) ?? [],
    };
  });
}

/** The provider a title is filed under: active mapping, manga default, then any mapping. */
function providerValue(row: ReferenceRow, providerByMappingId: Map<string, string>): string | null {
  return (
    (row.activeProviderMappingId === null
      ? undefined
      : providerByMappingId.get(row.activeProviderMappingId)) ??
    providerByMappingId.get(row.defaultProviderMappingId) ??
    row.providerIds[0] ??
    null
  );
}

function sortValue(row: ReferenceRow, key: LibrarySortKey): string | number | null {
  switch (key) {
    case 'title':
      return row.title === '' ? null : row.title;
    case 'date_added':
      return row.addedAt === null || row.addedAt === '' ? null : row.addedAt;
    case 'last_updated':
      return row.updatedAt === null || row.updatedAt === '' ? null : row.updatedAt;
    case 'last_read':
      return row.lastReadAt === '' ? null : row.lastReadAt;
    case 'unread':
      return row.unread;
    case 'progress':
      return row.progress;
    case 'provider':
      return row.providerIds[0] ?? null;
  }
}

function referenceOrder(
  rows: readonly ReferenceRow[],
  sort: LibrarySort,
  providerByMappingId: Map<string, string>,
): string[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows]
    .sort((a, b) => {
      const byId = a.id.localeCompare(b.id);
      const left =
        sort.key === 'provider' ? providerValue(a, providerByMappingId) : sortValue(a, sort.key);
      const right =
        sort.key === 'provider' ? providerValue(b, providerByMappingId) : sortValue(b, sort.key);
      if (left === null || right === null) {
        if (left === right) return byId;
        // Missing values rank last in both directions.
        return left === null ? 1 : -1;
      }
      const compared =
        typeof left === 'number' && typeof right === 'number'
          ? direction * (left - right)
          : direction * String(left).localeCompare(String(right));
      return compared || byId;
    })
    .map((row) => row.id);
}

interface Seeded {
  readonly harness: SqlJsHarness;
  readonly entryIds: readonly LibraryEntryId[];
  readonly categoryId: string;
}

/** Deliberate edge cases: empty timestamps, missing progress, ties, a second provider. */
async function seedLibrary(): Promise<Seeded> {
  const harness = await createSqlJsHarness();
  const { db, raw } = harness;
  const specs = [
    { remote: 'alpha', title: 'Alpha', provider: 'prov-a', status: 'reading' },
    { remote: 'beta', title: 'Beta', provider: 'prov-b', status: 'completed' },
    { remote: 'gamma', title: 'Gamma', provider: 'prov-a', status: 'planned' },
    { remote: 'delta', title: 'Delta', provider: 'prov-a', status: 'reading' },
    { remote: 'epsilon', title: 'Epsilon', provider: 'prov-b', status: 'on_hold' },
    { remote: 'zeta', title: 'Zeta', provider: 'prov-a', status: 'dropped' },
    { remote: 'eta', title: 'Eta', provider: 'prov-a', status: 'reading' },
    { remote: 'theta', title: 'Theta', provider: 'prov-b', status: 'reading' },
    { remote: 'iota', title: 'Iota', provider: 'prov-a', status: 'completed' },
    { remote: 'kappa', title: 'Kappa', provider: 'prov-a', status: 'reading' },
    { remote: 'lambda', title: 'Lambda', provider: 'prov-b', status: 'reading' },
    { remote: 'mu', title: 'Mu', provider: 'prov-a', status: 'planned' },
    { remote: 'nu', title: 'Nu', provider: 'prov-a', status: 'reading' },
    { remote: 'xi', title: 'Xi', provider: 'prov-b', status: 'reading' },
  ] as const;

  const entryIds: LibraryEntryId[] = [];
  const mangaIds: string[] = [];
  for (const [index, spec] of specs.entries()) {
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: spec.title,
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId(spec.provider),
      providerMangaId: spec.remote,
    });
    if (!created.ok) throw new Error(created.error.message);
    const entryId = toLibraryEntryId(`entry-${spec.remote}`);
    const added = await addLibraryEntry(db, {
      mangaId: created.value.mangaId,
      id: entryId,
      status: spec.status,
    });
    if (!added.ok) throw new Error(added.error.message);
    entryIds.push(entryId);
    mangaIds.push(created.value.mangaId);
    // Empty timestamps, equal timestamps and missing values all appear on purpose.
    const addedAt =
      index === 3
        ? null
        : index === 4
          ? '2026-01-01T00:00:00.000Z'
          : `2026-01-${10 + index}T00:00:00.000Z`;
    const updatedAt =
      index === 6
        ? null
        : index === 7
          ? '2026-02-01T00:00:00.000Z'
          : `2026-02-${10 + index}T00:00:00.000Z`;
    raw.run(
      'UPDATE library_entries SET added_at = ?, updated_at = ?, progress_percent = ? WHERE id = ?',
      [addedAt, updatedAt, index % 4 === 0 ? null : (index * 7) % 100, entryId],
    );
  }

  await setLibraryEntriesFavorite(db, [entryIds[0]!, entryIds[1]!, entryIds[4]!], true);
  await setLibraryEntriesStatus(db, [entryIds[1]!, entryIds[8]!], 'completed');

  const category = await createLibraryCategory(db, { name: 'Priority' });
  if (!category.ok) throw new Error(category.error.message);
  await addLibraryEntriesToCategories(
    db,
    [entryIds[0]!, entryIds[2]!, entryIds[4]!, entryIds[5]!],
    [category.value],
  );

  // A second mapping on one title, and an active switch on another.
  const second = await addProviderMapping(db, {
    mangaId: toMangaId(mangaIds[10]!),
    providerId: toProviderId('prov-a'),
    providerMangaId: 'lambda-other',
  });
  if (!second.ok) throw new Error(second.error.message);
  await setLibraryEntryActiveProviderMapping(db, entryIds[10]!, second.value);
  // Alternative titles the text query must find.
  raw.run(
    "INSERT INTO manga_titles (id, manga_id, locale, value) VALUES ('title-zeta', ?, 'en', 'Solar Chronicles')",
    [mangaIds[5]!],
  );

  // Read states: two titles share a timestamp to force the id tie-break.
  raw.run(`
    INSERT INTO chapters (id, manga_id, provider_mapping_id, title, chapter_index)
    SELECT 'chapter-' || le.id, le.manga_id, mi.default_provider_mapping_id, 'Ch 1', 0
    FROM library_entries le JOIN manga_identities mi ON mi.id = le.manga_id
    WHERE le.id IN ('entry-alpha', 'entry-beta', 'entry-gamma', 'entry-delta')
  `);
  raw.run(`
    INSERT INTO chapter_read_state
      (chapter_id, manga_id, read_percent, last_page_index, completed, updated_at)
    SELECT 'chapter-' || id, manga_id, 1, 0, 1, updated_at FROM library_entries
    WHERE id IN ('entry-alpha', 'entry-beta', 'entry-gamma')
  `);
  raw.run(`
    UPDATE chapter_read_state SET updated_at = '2026-03-01T00:00:00.000Z'
    WHERE chapter_id IN ('chapter-entry-alpha', 'chapter-entry-gamma')
  `);
  raw.run(
    "UPDATE library_entries SET last_read_chapter_id = 'chapter-' || id WHERE id IN ('entry-alpha', 'entry-beta', 'entry-gamma')",
  );

  return { harness, entryIds, categoryId: category.value };
}

const SORTS: LibrarySort[] = (
  ['title', 'date_added', 'last_updated', 'last_read', 'unread', 'progress', 'provider'] as const
).flatMap((key) => [
  { key, direction: 'asc' } as LibrarySort,
  { key, direction: 'desc' } as LibrarySort,
]);

describe('listLibraryEntryPage', () => {
  it('Given every sort key, Then pages match the reference order with no gap or duplicate', async () => {
    const { harness } = await seedLibrary();
    const reference = referenceRows(harness);
    const providerByMappingId = new Map(
      rowsOf(harness.raw, 'SELECT id, provider_id FROM manga_provider_mappings').map((value) => {
        const [id, providerId] = value as [string, string];
        return [id, providerId] as const;
      }),
    );

    for (const sort of SORTS) {
      const expected = referenceOrder(reference, sort, providerByMappingId);
      const collected: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await listLibraryEntryPage(harness.db, { sort, limit: 4, offset });
        collected.push(...page.items.map((entry) => entry.id));
        expect(page.total).toBe(reference.length);
        if (page.items.length === 0) break;
        offset += page.items.length;
      }
      expect({ order: `${sort.key} ${sort.direction}`, collected }).toEqual({
        order: `${sort.key} ${sort.direction}`,
        collected: expected,
      });
      expect(new Set(collected).size).toBe(expected.length);
    }
  });

  it('Given filters, Then the page matches the reference filter and keeps the same totals', async () => {
    const { harness, categoryId } = await seedLibrary();
    const reference = referenceRows(harness);
    const providerByMappingId = new Map(
      rowsOf(harness.raw, 'SELECT id, provider_id FROM manga_provider_mappings').map((value) => {
        const [id, providerId] = value as [string, string];
        return [id, providerId] as const;
      }),
    );
    const filters: { readonly name: string; readonly filter: LibraryFilter }[] = [
      { name: 'favorites', filter: { favoritesOnly: true } },
      { name: 'statuses', filter: { statuses: ['reading', 'completed'] } },
      { name: 'category', filter: { categoryIds: [toCategoryId(categoryId)] } },
      { name: 'provider', filter: { providerIds: [toProviderId('prov-b')] } },
      { name: 'query', filter: { query: 'sol' } },
      {
        name: 'combined',
        filter: {
          favoritesOnly: true,
          statuses: ['reading', 'completed'],
          providerIds: [toProviderId('prov-a')],
          query: 'a',
        },
      },
    ];

    for (const { name, filter } of filters) {
      const needle = filter.query?.toLowerCase();
      const expected = referenceOrder(
        reference.filter((row) => {
          if (filter.favoritesOnly === true && !row.favorite) return false;
          if (
            filter.statuses !== undefined &&
            filter.statuses.length > 0 &&
            !filter.statuses.includes(row.status as never)
          ) {
            return false;
          }
          if (
            filter.categoryIds !== undefined &&
            filter.categoryIds.length > 0 &&
            !row.categoryIds.some((id) => filter.categoryIds?.includes(toCategoryId(id)))
          ) {
            return false;
          }
          if (
            filter.providerIds !== undefined &&
            filter.providerIds.length > 0 &&
            !row.providerIds.some((id) => filter.providerIds?.includes(toProviderId(id)))
          ) {
            return false;
          }
          if (needle !== undefined) {
            const titles = [row.title, ...row.alternativeTitles];
            if (!titles.some((title) => title.toLowerCase().includes(needle))) return false;
          }
          return true;
        }),
        { key: 'title', direction: 'asc' },
        providerByMappingId,
      );

      const page = await listLibraryEntryPage(harness.db, {
        filter,
        sort: { key: 'title', direction: 'asc' },
        limit: 200,
      });
      expect({ filter: name, entries: page.items.map((entry) => entry.id) }).toEqual({
        filter: name,
        entries: expected,
      });
      expect({ filter: name, total: page.total }).toEqual({ filter: name, total: expected.length });
    }
  });

  it('Given a limit and an offset, Then the boundaries are exact and the total ignores them', async () => {
    const { harness } = await seedLibrary();
    const all = await listLibraryEntryPage(harness.db, { limit: 200 });
    expect(all.items).toHaveLength(14);

    const none = await listLibraryEntryPage(harness.db, { limit: 0 });
    expect(none.items).toEqual([]);
    expect(none.total).toBe(14);

    const beyond = await listLibraryEntryPage(harness.db, { limit: 5, offset: 99 });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(14);

    const last = await listLibraryEntryPage(harness.db, { limit: 5, offset: 10 });
    expect(last.items.map((entry) => entry.id)).toEqual(
      all.items.slice(10).map((entry) => entry.id),
    );
  });

  it('Given chapters and read state, Then only the page rows get live unread counts', async () => {
    const { harness, entryIds } = await seedLibrary();
    // A stored count that disagrees with read state must not survive on screen.
    harness.raw.run('UPDATE library_entries SET unread_count = 99 WHERE id = ?', [entryIds[0]!]);
    harness.raw.run('UPDATE library_entries SET unread_count = 5 WHERE id = ?', [entryIds[12]!]);

    const page = await listLibraryEntryPage(harness.db, {
      sort: { key: 'date_added', direction: 'asc' },
      limit: 200,
    });
    // One chapter, read: zero unread replaces the stale stored 99.
    expect(page.items.find((entry) => entry.id === entryIds[0])?.unreadCount).toBe(0);
    // A title with no local chapters keeps its stored count as the fallback.
    expect(page.items.find((entry) => entry.id === entryIds[12])?.unreadCount).toBe(5);

    // The full list used by backup keeps the same live counts.
    const all = await listLibraryEntries(harness.db);
    expect(all.find((entry) => entry.id === entryIds[0])?.unreadCount).toBe(0);
    expect(all.find((entry) => entry.id === entryIds[12])?.unreadCount).toBe(5);
  });

  it('Given a query filter, Then the total counts matches beyond the first page', async () => {
    const { harness } = await seedLibrary();
    const page = await listLibraryEntryPage(harness.db, {
      filter: { query: 'et' },
      sort: { key: 'title', direction: 'asc' },
      limit: 2,
    });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
  });
});
