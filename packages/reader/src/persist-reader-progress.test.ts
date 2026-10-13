import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getChapterReadState,
  getLibraryEntryForManga,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toChapterPageId, toProviderId } from '@app/shared';
import { buildProgressEvent, persistReaderProgress } from './persist-reader-progress.js';

describe('persistReaderProgress', () => {
  it('writes chapter read state and library resume metadata', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Progress Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'progress-1',
      language: 'en',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { mangaId, mappingId } = created.value;
    const chapterId = toChapterId('chapter-progress-1');

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
          image: { url: 'https://example.com/1.jpg' },
        },
      ],
    });

    await addLibraryEntry(db, { mangaId, status: 'reading' });

    const event = buildProgressEvent(chapterId, mangaId, 0, 1);
    await persistReaderProgress(db, event);

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(0);
    expect(readState?.progress.readPercent).toBe(100);
    expect(readState?.progress.completed).toBe(true);

    const libraryEntry = await getLibraryEntryForManga(db, mangaId);
    expect(libraryEntry?.lastReadChapterId).toBe(chapterId);
    expect(libraryEntry?.progressPercent).toBe(100);
  });


  it('does not roll progress back when an older event arrives late', async () => {
    const { db } = await createSqlJsHarness();

    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: 'Stale Progress Target',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: 'stale-progress-1',
      language: 'en',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { mangaId, mappingId } = created.value;
    const chapterId = toChapterId('chapter-stale-1');

    await upsertChapterWithPages(db, {
      chapterId,
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter 1',
      index: 1,
      pages: [
        {
          id: toChapterPageId('stale-page-1'),
          index: 0,
          image: { url: 'https://example.com/1.jpg' },
        },
      ],
    });

    // A newer event lands first (page 2 of the chapter)...
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 5,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });

    // ...then a stale event created before it (a duplicated reader instance
    // unmounting late). It must not roll progress back to page 1.
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 0,
      readPercent: 3,
      completed: false,
      timestamp: '2026-10-13T11:59:59.000Z',
    });

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(1);
  });
});
