import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createLibraryCategory,
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
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
  options: { readonly completed?: boolean } = {},
): Promise<void> {
  const chapterId = toChapterId(`chapter-${title.mangaId}-${index}`);
  await upsertChapterWithPages(db, {
    chapterId,
    mangaId: title.mangaId,
    providerMappingId: title.mappingId,
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
});
