import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toMangaId, toProviderId } from '@app/shared';
import { fetchMangaDetail } from './fetch-manga-detail.js';

describe('fetchMangaDetail', () => {
  it('returns undefined when manga identity is missing', async () => {
    const { db } = await createSqlJsHarness();
    const detail = await fetchMangaDetail(db, toMangaId('missing-manga'));
    expect(detail).toBeUndefined();
  });

  it('returns manga identity, chapters, and library entry from local db', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Detail Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'detail-1',
      language: 'en',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { mangaId, mappingId } = created.value;

    await upsertChapterWithPages(db, {
      chapterId: toChapterId('chapter-1'),
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter 1',
      index: 1,
      pages: [],
    });

    await addLibraryEntry(db, { mangaId, status: 'reading' });

    const detail = await fetchMangaDetail(db, mangaId);
    expect(detail).toBeDefined();
    expect(detail?.manga.canonicalTitle).toBe('Detail Target');
    expect(detail?.chapters).toHaveLength(1);
    expect(detail?.libraryEntry?.mangaId).toBe(mangaId);
    expect(detail?.continueChapterId).toBe(toChapterId('chapter-1'));
  });
});
