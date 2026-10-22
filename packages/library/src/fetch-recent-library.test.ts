import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
  setLibraryEntryActiveProviderMapping,
  setLibraryEntryFavorite,
  updateLibraryEntryReadingProgress,
  upsertChapterReadState,
  upsertChapterWithPages,
  type AppDrizzleDb,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toProviderId } from '@app/shared';
import { fetchRecentLibrary, RECENT_LIBRARY_LIMIT } from './fetch-recent-library.js';

async function addReadingEntry(db: AppDrizzleDb, title: string) {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: title,
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: title.toLowerCase().replaceAll(' ', '-'),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('unreachable');
  await addLibraryEntry(db, { mangaId: created.value.mangaId, status: 'reading' });
  return created.value;
}

/**
 * Mirrors the reader's persist path: the progress event timestamp lands on
 * both the chapter read state and the library resume metadata.
 */
async function recordProgress(
  db: AppDrizzleDb,
  entry: Awaited<ReturnType<typeof addReadingEntry>>,
  chapterId: string,
  progressPercent: number,
  updatedAt: string,
) {
  const chapter = await upsertChapterWithPages(db, {
    chapterId: toChapterId(chapterId),
    mangaId: entry.mangaId,
    providerMappingId: entry.mappingId,
    title: chapterId,
    index: 1,
    pages: [],
  });
  expect(chapter.ok).toBe(true);
  await upsertChapterReadState(db, {
    chapterId: toChapterId(chapterId),
    mangaId: entry.mangaId,
    progress: { readPercent: progressPercent, lastPageIndex: 1, completed: false, updatedAt },
  });
  await updateLibraryEntryReadingProgress(db, {
    mangaId: entry.mangaId,
    chapterId: toChapterId(chapterId),
    progressPercent,
    updatedAt,
  });
}

describe('fetchRecentLibrary', () => {
  it('returns read titles newest first and skips never-opened ones', async () => {
    const { db } = await createSqlJsHarness();

    const alpha = await addReadingEntry(db, 'Alpha Series');
    const beta = await addReadingEntry(db, 'Beta Chronicles');
    await addReadingEntry(db, 'Gamma Unread');

    await recordProgress(db, alpha, 'chapter-alpha-1', 10, '2026-01-01T00:00:00.000Z');
    await recordProgress(db, beta, 'chapter-beta-1', 40, '2026-02-01T00:00:00.000Z');

    const recent = await fetchRecentLibrary(db);
    expect(recent.map((item) => item.manga.canonicalTitle)).toEqual([
      'Beta Chronicles',
      'Alpha Series',
    ]);
    expect(recent[0]?.entry.lastReadChapterId).toBe('chapter-beta-1');
  });

  it('caps the list without dropping the newest read', async () => {
    const { db } = await createSqlJsHarness();

    for (let index = 0; index < RECENT_LIBRARY_LIMIT + 2; index++) {
      const entry = await addReadingEntry(db, `Series ${index}`);
      await recordProgress(db, entry, `chapter-${index}`, 5, `2026-01-0${index + 1}T00:00:00.000Z`);
    }

    const recent = await fetchRecentLibrary(db);
    expect(recent).toHaveLength(RECENT_LIBRARY_LIMIT);
    expect(recent[0]?.manga.canonicalTitle).toBe(`Series ${RECENT_LIBRARY_LIMIT + 1}`);
  });

  it('keeps reading order after favorite and mapping writes bump library updatedAt', async () => {
    const { db } = await createSqlJsHarness();

    const alpha = await addReadingEntry(db, 'Alpha Series');
    const beta = await addReadingEntry(db, 'Beta Chronicles');
    await recordProgress(db, alpha, 'chapter-alpha-1', 10, '2026-01-01T00:00:00.000Z');
    await recordProgress(db, beta, 'chapter-beta-1', 40, '2026-02-01T00:00:00.000Z');

    const alphaEntry = await getLibraryEntryForManga(db, alpha.mangaId);
    if (alphaEntry === undefined) throw new Error('missing library entry');
    expect((await setLibraryEntryFavorite(db, alphaEntry.id, true)).ok).toBe(true);
    expect(
      (await setLibraryEntryActiveProviderMapping(db, alphaEntry.id, alpha.mappingId)).ok,
    ).toBe(true);

    const recent = await fetchRecentLibrary(db);
    expect(recent.map((item) => item.manga.canonicalTitle)).toEqual([
      'Beta Chronicles',
      'Alpha Series',
    ]);
  });

  it('falls back to library updatedAt when no read-state row exists', async () => {
    const { db } = await createSqlJsHarness();

    const alpha = await addReadingEntry(db, 'Alpha Series');
    const beta = await addReadingEntry(db, 'Beta Chronicles');
    await updateLibraryEntryReadingProgress(db, {
      mangaId: alpha.mangaId,
      chapterId: toChapterId('chapter-alpha-1'),
      progressPercent: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await updateLibraryEntryReadingProgress(db, {
      mangaId: beta.mangaId,
      chapterId: toChapterId('chapter-beta-1'),
      progressPercent: 40,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    const recent = await fetchRecentLibrary(db);
    expect(recent.map((item) => item.manga.canonicalTitle)).toEqual([
      'Beta Chronicles',
      'Alpha Series',
    ]);
  });

  it('returns an empty list when nothing has been read', async () => {
    const { db } = await createSqlJsHarness();
    await addReadingEntry(db, 'Never Opened');

    await expect(fetchRecentLibrary(db)).resolves.toEqual([]);
  });
});
