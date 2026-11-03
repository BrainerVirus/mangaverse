// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Database, SqlValue } from 'sql.js';
import {
  addLibraryEntry,
  addProviderMapping,
  createLibraryCategory,
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
  setLibraryEntryActiveProviderMapping,
  setLibraryEntryCategories,
  updateLibraryEntryReadingProgress,
  upsertChapterReadState,
  upsertChapterWithPages,
  type AppDrizzleDb,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import {
  toChapterId,
  type LibraryEntryId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import { fetchLibraryOverview } from './fetch-library-overview.js';

interface TestTitle {
  readonly mangaId: MangaId;
  readonly mappingId: ProviderMappingId;
  readonly entryId: LibraryEntryId;
}

async function addTitle(
  db: AppDrizzleDb,
  title: string,
  options: { readonly status?: 'reading' | 'completed' | 'planned' } = {},
): Promise<TestTitle> {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: title,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: 'prov-a',
    providerMangaId: `${title.toLowerCase().replaceAll(' ', '-')}-remote`,
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('unreachable');
  await addLibraryEntry(db, {
    mangaId: created.value.mangaId,
    status: options.status ?? 'reading',
  });
  const entry = await getLibraryEntryForManga(db, created.value.mangaId);
  if (entry === undefined) throw new Error('missing entry');
  return {
    mangaId: created.value.mangaId,
    mappingId: created.value.mappingId,
    entryId: entry.id,
  };
}

async function addChapter(
  db: AppDrizzleDb,
  title: TestTitle,
  index: number,
  options: { readonly completed?: boolean; readonly mappingId?: ProviderMappingId } = {},
): Promise<void> {
  const chapterId = toChapterId(
    options.mappingId === undefined
      ? `chapter-${title.mangaId}-${index}`
      : `chapter-${title.mangaId}-${options.mappingId}-${index}`,
  );
  await upsertChapterWithPages(db, {
    chapterId,
    mangaId: title.mangaId,
    providerMappingId: options.mappingId ?? title.mappingId,
    title: `Chapter ${index}`,
    index,
    pages: [],
  });
  if (options.completed === true) {
    await upsertChapterReadState(db, {
      chapterId,
      mangaId: title.mangaId,
      progress: {
        readPercent: 100,
        lastPageIndex: 1,
        completed: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  }
}

async function markRead(
  db: AppDrizzleDb,
  title: TestTitle,
  chapterIndex: number,
  readAt: string,
): Promise<void> {
  await updateLibraryEntryReadingProgress(db, {
    mangaId: title.mangaId,
    chapterId: toChapterId(`chapter-${title.mangaId}-${chapterIndex}`),
    progressPercent: 40,
    updatedAt: readAt,
  });
}

describe('fetchLibraryOverview', () => {
  it('Given never-opened titles, When the library loads, Then continue reading is empty', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Fresh Title');
    await addChapter(db, title, 1);

    const overview = await fetchLibraryOverview(db);
    expect(overview.continueReading).toEqual([]);
  });

  it('Given one read title, Then continue reading resumes its last chapter with progress', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Alpha Series');
    await addChapter(db, title, 1);
    await addChapter(db, title, 2);
    await markRead(db, title, 1, '2026-01-01T00:00:00.000Z');

    const overview = await fetchLibraryOverview(db);
    expect(overview.continueReading).toHaveLength(1);
    expect(overview.continueReading[0]).toMatchObject({
      chapterCount: 2,
      unreadCount: 2,
      lastReadChapter: { index: 1, title: 'Chapter 1' },
      item: { entry: { progressPercent: 40 } },
    });
  });

  it('orders continue reading by progress event time, newest first', async () => {
    const { db } = await createSqlJsHarness();
    const alpha = await addTitle(db, 'Alpha Series');
    const beta = await addTitle(db, 'Beta Chronicles');
    const gamma = await addTitle(db, 'Gamma Unread');
    await addChapter(db, alpha, 1);
    await addChapter(db, beta, 1);
    await addChapter(db, gamma, 1);

    await markRead(db, alpha, 1, '2026-01-01T00:00:00.000Z');
    await markRead(db, beta, 1, '2026-02-01T00:00:00.000Z');

    const overview = await fetchLibraryOverview(db);
    expect(overview.continueReading.map((item) => item.item.manga.canonicalTitle)).toEqual([
      'Beta Chronicles',
      'Alpha Series',
    ]);
  });

  it('caps continue reading while keeping the newest read title', async () => {
    const { db } = await createSqlJsHarness();
    for (let index = 0; index < 8; index++) {
      const title = await addTitle(db, `Series ${index}`);
      await addChapter(db, title, 1);
      await markRead(db, title, 1, `2026-01-0${index + 1}T00:00:00.000Z`);
    }

    const overview = await fetchLibraryOverview(db, { continueLimit: 3 });
    expect(overview.continueReading).toHaveLength(3);
    expect(overview.continueReading[0]?.item.manga.canonicalTitle).toBe('Series 7');
  });

  it('lists only titles with chapters past the last read one', async () => {
    const { db } = await createSqlJsHarness();
    const caughtUp = await addTitle(db, 'Caught Up');
    const behind = await addTitle(db, 'Behind');
    const untouched = await addTitle(db, 'Untouched');

    await addChapter(db, caughtUp, 1, { completed: true });
    await markRead(db, caughtUp, 1, '2026-01-01T00:00:00.000Z');

    await addChapter(db, behind, 1, { completed: true });
    await addChapter(db, behind, 2);
    await markRead(db, behind, 1, '2026-01-01T00:00:00.000Z');

    await addChapter(db, untouched, 1);

    const overview = await fetchLibraryOverview(db);
    const titles = overview.recentlyUpdated.map((item) => item.item.manga.canonicalTitle);
    expect(titles).not.toContain('Caught Up');
    expect(titles).toEqual(expect.arrayContaining(['Behind', 'Untouched']));
    expect(
      overview.recentlyUpdated.find((item) => item.item.manga.canonicalTitle === 'Behind')
        ?.unreadCount,
    ).toBe(1);
    expect(
      overview.recentlyUpdated.find((item) => item.item.manga.canonicalTitle === 'Untouched')
        ?.latestChapter?.title,
    ).toBe('Chapter 1');
  });

  it('Given unread chapters at or before the last read one, Then the title is not recently updated', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Read To Latest');
    await addChapter(db, title, 1);
    await addChapter(db, title, 2);
    // Progress without a completed read state leaves unread > 0 and the latest
    // index equal to the last read index: only the index guard hides it.
    await markRead(db, title, 2, '2026-01-01T00:00:00.000Z');

    const overview = await fetchLibraryOverview(db);
    expect(overview.recentlyUpdated).toEqual([]);
  });

  it('Given a provider switch with lower chapter numbers, Then unread state still lists the title', async () => {
    const { db } = await createSqlJsHarness();
    const title = await addTitle(db, 'Switched Series');
    await addChapter(db, title, 1);
    await addChapter(db, title, 2);
    await addChapter(db, title, 3);
    await markRead(db, title, 3, '2026-01-01T00:00:00.000Z');

    const added = await addProviderMapping(db, {
      mangaId: title.mangaId,
      providerId: 'prov-b',
      providerMangaId: 'switched-series-remote',
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    await addChapter(db, title, 1, { mappingId: added.value });
    await addChapter(db, title, 2, { mappingId: added.value });
    const switched = await setLibraryEntryActiveProviderMapping(db, title.entryId, added.value);
    expect(switched.ok).toBe(true);

    const overview = await fetchLibraryOverview(db);
    const item = overview.recentlyUpdated.find(
      (entry) => entry.item.manga.canonicalTitle === 'Switched Series',
    );
    expect(item?.unreadCount).toBe(2);
    expect(item?.latestChapter?.providerMappingId).toBe(added.value);
    expect(item?.lastReadChapter?.providerMappingId).toBe(title.mappingId);
  });

  it('applies the page filter to both sections', async () => {
    const { db } = await createSqlJsHarness();
    const alpha = await addTitle(db, 'Alpha Series', { status: 'reading' });
    const beta = await addTitle(db, 'Beta Chronicles', { status: 'completed' });
    await addChapter(db, alpha, 1);
    await addChapter(db, beta, 1);
    await markRead(db, alpha, 1, '2026-01-01T00:00:00.000Z');
    await markRead(db, beta, 1, '2026-02-01T00:00:00.000Z');

    const category = await createLibraryCategory(db, { name: 'Fantasy' });
    expect(category.ok).toBe(true);
    if (!category.ok) return;
    await setLibraryEntryCategories(db, alpha.entryId, [category.value]);

    const filtered = await fetchLibraryOverview(db, { filter: { categoryIds: [category.value] } });
    expect(filtered.continueReading.map((item) => item.item.manga.canonicalTitle)).toEqual([
      'Alpha Series',
    ]);

    const statusFiltered = await fetchLibraryOverview(db, { filter: { statuses: ['completed'] } });
    expect(statusFiltered.continueReading.map((item) => item.item.manga.canonicalTitle)).toEqual([
      'Beta Chronicles',
    ]);
    expect(statusFiltered.recentlyUpdated).toEqual([]);

    // The library search box narrows the sections too.
    const searched = await fetchLibraryOverview(db, { filter: { query: 'alpha' } });
    expect(searched.continueReading.map((item) => item.item.manga.canonicalTitle)).toEqual([
      'Alpha Series',
    ]);
  });

  it('shows no updated time when the chapter row has none', async () => {
    const { db, raw } = await createSqlJsHarness();
    const title = await addTitle(db, 'No Timestamps');
    await addChapter(db, title, 1);
    raw.run('UPDATE chapters SET created_at = NULL WHERE id = ?', [`chapter-${title.mangaId}-1`]);

    const overview = await fetchLibraryOverview(db);
    expect(overview.recentlyUpdated).toHaveLength(1);
    expect(overview.recentlyUpdated[0]?.latestChapter?.addedAt).toBeUndefined();
  });

  it('Given a library, Then chapter stats read only the selected rows', async () => {
    const { db, raw } = await createSqlJsHarness();
    seedOverviewLibrary(raw, 120, 10);

    // The whole-library path passed every manga id (chunked at 500) to its chapters
    // query. A bounded overview asks for at most both shelves (14 entries).
    const statements: { readonly sql: string; readonly params: readonly SqlValue[] }[] = [];
    const prepare = raw.prepare.bind(raw);
    raw.prepare = ((sql: string) => {
      const statement = prepare(sql);
      const bind = statement.bind.bind(statement);
      (statement as unknown as { bind: (params?: SqlValue[]) => unknown }).bind = (
        params?: SqlValue[],
      ) => {
        if (/^(select|with)/i.test(sql.trim())) statements.push({ sql, params: params ?? [] });
        return bind(params);
      };
      return statement;
    }) as typeof raw.prepare;

    const overview = await fetchLibraryOverview(db);
    raw.prepare = prepare;

    expect(overview.continueReading.length).toBeGreaterThan(0);
    expect(overview.recentlyUpdated.length).toBeGreaterThan(0);
    const chapterReads = statements.filter((statement) =>
      /from\s+"?chapters"?/i.test(statement.sql),
    );
    expect(chapterReads.length).toBeGreaterThan(0);
    for (const statement of chapterReads) {
      expect({ sql: statement.sql, bounded: statement.params.length <= 32 }).toEqual({
        sql: statement.sql,
        bounded: true,
      });
    }
  });
});

function seedOverviewLibrary(raw: Database, titles: number, chaptersPerTitle: number): void {
  const n = (count: number) =>
    `WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x < ${count - 1})`;
  raw.run(`
    ${n(titles)}
    INSERT INTO manga_identities
      (id, canonical_title, status, content_rating, merged, default_provider_mapping_id)
    SELECT 'manga-' || printf('%04d', x), 'Title ' || printf('%04d', x), 'ongoing', 'safe', 0,
           'mapping-' || printf('%04d', x)
    FROM n;
    ${n(titles)}
    INSERT INTO manga_provider_mappings (id, manga_id, provider_id, provider_manga_id)
    SELECT 'mapping-' || printf('%04d', x), 'manga-' || printf('%04d', x), 'prov-a', 'remote-' || x
    FROM n;
    ${n(titles)}
    INSERT INTO library_entries
      (id, manga_id, favorite, status, unread_count, added_at, updated_at, last_read_chapter_id)
    SELECT 'entry-' || printf('%04d', x), 'manga-' || printf('%04d', x), 0, 'reading', 0,
           '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
           CASE WHEN x % 10 = 0 THEN 'chapter-' || (x * ${chaptersPerTitle}) ELSE NULL END
    FROM n;
    ${n(titles * chaptersPerTitle)}
    INSERT INTO chapters (id, manga_id, provider_mapping_id, title, chapter_index)
    SELECT 'chapter-' || x,
           'manga-' || printf('%04d', x / ${chaptersPerTitle}),
           'mapping-' || printf('%04d', x / ${chaptersPerTitle}),
           'Chapter ' || (x % ${chaptersPerTitle}),
           x % ${chaptersPerTitle}
    FROM n;
    ${n(titles)}
    INSERT INTO chapter_read_state
      (chapter_id, manga_id, read_percent, last_page_index, completed, updated_at)
    SELECT 'chapter-' || (x * ${chaptersPerTitle}), 'manga-' || printf('%04d', x), 1, 0, 1,
           '2026-03-01T00:00:00.000Z'
    FROM n WHERE x % 10 = 0;
  `);
}
