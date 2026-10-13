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
  async function seedChapter(db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'], suffix: string) {
    const created = await createMangaIdentityWithInitialMapping(db, {
      canonicalTitle: `Progress ${suffix}`,
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-a'),
      providerMangaId: `progress-${suffix}`,
      language: 'en',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('seed failed');
    const { mangaId, mappingId } = created.value;
    const chapterId = toChapterId(`chapter-${suffix}`);
    await upsertChapterWithPages(db, {
      chapterId,
      mangaId,
      providerMappingId: mappingId,
      title: 'Chapter 1',
      index: 1,
      pages: [{ id: toChapterPageId(`page-${suffix}`), index: 0, image: { url: 'https://example.com/1.jpg' } }],
    });
    return { mangaId, chapterId };
  }

  it('Given an event created after an earlier one but written later, When persisted, Then it wins', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, chapterId } = await seedChapter(db, 'write-order');

    // The first write commits "now" (a real, later wall-clock time). Its stored
    // ordering timestamp must be the event's own creation time, or the second
    // event (created later than the first, yet before that commit) is rejected.
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 0,
      readPercent: 3,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 5,
      completed: false,
      timestamp: '2026-10-13T12:00:00.500Z',
    });

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(1);
  });

  it('Given two events with the same timestamp, When persisted, Then the furthest progress wins', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, chapterId } = await seedChapter(db, 'tie');

    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 5,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });
    // A stale checkpoint in the same millisecond must not roll the page back.
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 0,
      readPercent: 3,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(1);
  });

  it('Given a newer write issued before an older event, When both persist concurrently, Then the newer event is stored', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, chapterId } = await seedChapter(db, 'race-reversed');

    // The newer event is issued first and the older one right after: without
    // per-chapter serialization both reads see no stored state and the older
    // write can land last.
    const newer = persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 2,
      readPercent: 8,
      completed: false,
      timestamp: '2026-10-13T12:00:01.000Z',
    });
    const older = persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 5,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });
    await Promise.all([newer, older]);

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(2);
  });

  it('Given racing writes, When both persist, Then the newer event ends up stored', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, chapterId } = await seedChapter(db, 'race');

    const older = persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 5,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });
    const newer = persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 2,
      readPercent: 8,
      completed: false,
      timestamp: '2026-10-13T12:00:01.000Z',
    });
    await Promise.all([older, newer]);

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(2);
  });
});
