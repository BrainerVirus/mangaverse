import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getChapterReadState,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toChapterPageId, toMangaId, toProviderId } from '@app/shared';
import { fetchReaderPage } from './fetch-reader-page.js';

describe('fetchReaderPage', () => {
  it('returns undefined when chapter is missing', async () => {
    const { db } = await createSqlJsHarness();
    const page = await fetchReaderPage(db, toChapterId('missing-chapter'));
    expect(page).toBeUndefined();
  });

  it('loads chapter pages, resume index, and reader settings from local db', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Reader Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'reader-1',
      language: 'en',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { mangaId, mappingId } = created.value;
    const chapterId = toChapterId('chapter-reader-1');

    await upsertChapterWithPages(db, {
      chapterId,
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter 1',
      index: 1,
      pages: [
        {
          id: toChapterPageId('page-1'),
          index: 0,
          image: { url: 'https://example.com/1.jpg', width: 800, height: 1200 },
        },
        {
          id: toChapterPageId('page-2'),
          index: 1,
          image: { url: 'https://example.com/2.jpg', width: 800, height: 1200 },
        },
      ],
    });

    await addLibraryEntry(db, { mangaId, status: 'reading' });

    const { upsertChapterReadState } = await import('@app/db');
    await upsertChapterReadState(db, {
      chapterId,
      mangaId,
      progress: {
        readPercent: 50,
        lastPageIndex: 1,
        completed: false,
      },
    });

    const page = await fetchReaderPage(db, chapterId);
    expect(page).toBeDefined();
    expect(page?.chapter.title).toBe('Chapter 1');
    expect(page?.chapter.pageCount).toBe(2);
    expect(page?.initialPageIndex).toBe(1);
    expect(page?.engineSettings.readingMode).toBe('ltr');

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(1);
  });
});
