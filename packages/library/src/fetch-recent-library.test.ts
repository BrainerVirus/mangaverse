import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  updateLibraryEntryReadingProgress,
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
  return created.value.mangaId;
}

describe('fetchRecentLibrary', () => {
  it('returns read titles newest first and skips never-opened ones', async () => {
    const { db } = await createSqlJsHarness();

    const alpha = await addReadingEntry(db, 'Alpha Series');
    const beta = await addReadingEntry(db, 'Beta Chronicles');
    await addReadingEntry(db, 'Gamma Unread');

    await updateLibraryEntryReadingProgress(db, {
      mangaId: alpha,
      chapterId: toChapterId('chapter-alpha-1'),
      progressPercent: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await updateLibraryEntryReadingProgress(db, {
      mangaId: beta,
      chapterId: toChapterId('chapter-beta-1'),
      progressPercent: 40,
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

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
      const mangaId = await addReadingEntry(db, `Series ${index}`);
      await updateLibraryEntryReadingProgress(db, {
        mangaId,
        chapterId: toChapterId(`chapter-${index}`),
        progressPercent: 5,
        updatedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      });
    }

    const recent = await fetchRecentLibrary(db);
    expect(recent).toHaveLength(RECENT_LIBRARY_LIMIT);
    expect(recent[0]?.manga.canonicalTitle).toBe(`Series ${RECENT_LIBRARY_LIMIT + 1}`);
  });

  it('returns an empty list when nothing has been read', async () => {
    const { db } = await createSqlJsHarness();
    await addReadingEntry(db, 'Never Opened');

    await expect(fetchRecentLibrary(db)).resolves.toEqual([]);
  });
});
