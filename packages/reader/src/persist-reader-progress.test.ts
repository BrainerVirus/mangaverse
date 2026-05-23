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
});
