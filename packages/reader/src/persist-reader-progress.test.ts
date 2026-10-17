import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getChapterReadState,
  getLibraryEntryForManga,
  upsertChapterWithPages,
} from '@app/db';
import {
  createMemoryPersistedBytesStore,
  openPersistentDatabase,
  type PersistentDatabase,
} from '@app/db/browser';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toChapterPageId, toProviderId, type ChapterId } from '@app/shared';
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

  /** One manga with two chapters: a "continue reading" target and an older one. */
  async function seedTwoChapters(db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'], suffix: string) {
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
    const seed = async (chapterId: ChapterId, index: number) => {
      await upsertChapterWithPages(db, {
        chapterId,
        mangaId,
        providerMappingId: mappingId,
        title: `Chapter ${index}`,
        index,
        pages: [{ id: toChapterPageId(`page-${suffix}-${index}`), index: 0, image: { url: 'https://example.com/1.jpg' } }],
      });
    };
    const olderChapterId = toChapterId(`chapter-${suffix}-1`);
    const newerChapterId = toChapterId(`chapter-${suffix}-2`);
    await seed(olderChapterId, 1);
    await seed(newerChapterId, 2);
    await addLibraryEntry(db, { mangaId, status: 'reading' });
    return { mangaId, olderChapterId, newerChapterId };
  }

  it('Given a stale event for a different chapter, When it persists, Then the newer library resume metadata survives', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, olderChapterId, newerChapterId } = await seedTwoChapters(db, 'cross-chapter');

    // The user opened the newer chapter: resume metadata now points at it.
    await persistReaderProgress(db, {
      chapterId: newerChapterId,
      mangaId,
      pageIndex: 4,
      readPercent: 12,
      completed: false,
      timestamp: '2026-10-13T12:00:05.000Z',
    });

    // A late event from another chapter, created earlier (a duplicated reader
    // instance or a queued checkpoint). It is rejected for its own chapter, but
    // it must also not move "continue reading" back to the older chapter.
    await persistReaderProgress(db, {
      chapterId: olderChapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 2,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });

    const libraryEntry = await getLibraryEntryForManga(db, mangaId);
    expect(libraryEntry?.lastReadChapterId).toBe(newerChapterId);
    expect(libraryEntry?.progressPercent).toBe(12);
  });

  it('Given a stale event for the current chapter, When it persists, Then resume metadata is not rolled back', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, newerChapterId } = await seedTwoChapters(db, 'same-chapter');

    await persistReaderProgress(db, {
      chapterId: newerChapterId,
      mangaId,
      pageIndex: 4,
      readPercent: 12,
      completed: false,
      timestamp: '2026-10-13T12:00:05.000Z',
    });
    await persistReaderProgress(db, {
      chapterId: newerChapterId,
      mangaId,
      pageIndex: 0,
      readPercent: 1,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });

    const readState = await getChapterReadState(db, newerChapterId);
    expect(readState?.progress.lastPageIndex).toBe(4);
    const libraryEntry = await getLibraryEntryForManga(db, mangaId);
    expect(libraryEntry?.progressPercent).toBe(12);
  });

  it('Given a stale event for another chapter, When the library still points elsewhere, Then resume metadata stays put', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, olderChapterId, newerChapterId } = await seedTwoChapters(db, 'cross-chapter-pin');

    await persistReaderProgress(db, {
      chapterId: newerChapterId,
      mangaId,
      pageIndex: 9,
      readPercent: 30,
      completed: false,
      timestamp: '2026-10-13T12:00:05.000Z',
    });
    // The stale event is newer than the read state of *its own* chapter (none),
    // so only the library-level guard can reject the metadata write.
    await persistReaderProgress(db, {
      chapterId: olderChapterId,
      mangaId,
      pageIndex: 0,
      readPercent: 1,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });

    const libraryEntry = await getLibraryEntryForManga(db, mangaId);
    expect(libraryEntry?.lastReadChapterId).toBe(newerChapterId);
    expect(libraryEntry?.progressPercent).toBe(30);
  });

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
    await addLibraryEntry(db, { mangaId, status: 'reading' });

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
    const libraryEntry = await getLibraryEntryForManga(db, mangaId);
    expect(libraryEntry?.progressPercent).toBe(5);
  });

  it('Given equal-timestamp events, When the later one goes back, Then the furthest page wins (documented policy)', async () => {
    const { db } = await createSqlJsHarness();
    const { mangaId, chapterId } = await seedChapter(db, 'tie-backward');

    // Ruling: same-timestamp events keep the furthest page, not strict
    // last-action-wins. A stale debounced checkpoint and a fresh navigation can
    // share a millisecond; the stale one must never roll progress back, at the
    // cost of ignoring a same-millisecond backward navigation (sub-millisecond
    // user input cannot be ordered anyway).
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 5,
      readPercent: 50,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });
    await persistReaderProgress(db, {
      chapterId,
      mangaId,
      pageIndex: 2,
      readPercent: 20,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });

    const readState = await getChapterReadState(db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(5);
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

  it('Given two tabs where the older progress flushes first, When the newer tab flushes, Then the newer progress is not dropped', async () => {
    const harness = await createSqlJsHarness();
    const store = createMemoryPersistedBytesStore({ bytes: harness.raw.export(), version: 0 });
    const { sessionA, sessionB } = await openTwoSessions(store, harness);
    const { mangaId, chapterId } = await seedPersistentManga(sessionA.db);
    // Both tabs start from the same committed snapshot.
    expect((await sessionA.flush()).status).toBe('saved');
    await sessionB.syncFromStore();

    // Tab A holds an older uncommitted progress write.
    await persistReaderProgress(sessionA.db, {
      chapterId,
      mangaId,
      pageIndex: 1,
      readPercent: 5,
      completed: false,
      timestamp: '2026-10-13T12:00:00.000Z',
    });
    // Tab B holds a newer one, still uncommitted.
    await persistReaderProgress(sessionB.db, {
      chapterId,
      mangaId,
      pageIndex: 6,
      readPercent: 20,
      completed: false,
      timestamp: '2026-10-13T12:00:10.000Z',
    });

    // The older tab flushes first and commits its snapshot.
    expect((await sessionA.flush()).status).toBe('saved');
    // The newer tab's flush now conflicts with the committed snapshot. Its
    // uncommitted progress must survive the conflict instead of being replaced
    // by the older bytes.
    expect((await sessionB.flush()).status).toBe('reloaded');
    await sessionB.syncFromStore();

    const readState = await getChapterReadState(sessionB.db, chapterId);
    expect(readState?.progress.lastPageIndex).toBe(6);
    expect(readState?.progress.readPercent).toBe(20);
    const libraryEntry = await getLibraryEntryForManga(sessionB.db, mangaId);
    expect(libraryEntry?.progressPercent).toBe(20);
    expect(libraryEntry?.lastReadChapterId).toBe(chapterId);

    // The merged progress is what the store holds now, not just the in-memory
    // handle: a third tab opening from the store must see it.
    const stored = await store.read();
    expect(stored).toBeDefined();
    const storedDb = new harness.sqlModule.Database(stored!.bytes);
    const storedReadState = storedDb.exec(
      `SELECT last_page_index, read_percent FROM chapter_read_state WHERE chapter_id = '${chapterId}'`,
    );
    expect(storedReadState[0]?.values[0]).toEqual([6, 20]);
    const storedLibrary = storedDb.exec(
      `SELECT last_read_chapter_id, progress_percent FROM library_entries WHERE manga_id = '${mangaId}'`,
    );
    expect(storedLibrary[0]?.values[0]).toEqual([chapterId, 20]);
    storedDb.close();
  });});

/** Two sessions over one store: the snapshot CAS sees them as two tabs. */
async function openTwoSessions(
  store: ReturnType<typeof createMemoryPersistedBytesStore>,
  harness: Awaited<ReturnType<typeof createSqlJsHarness>>,
): Promise<{ sessionA: PersistentDatabase; sessionB: PersistentDatabase }> {
  const migrations = { journal: { version: '0', dialect: 'sqlite', entries: [] }, files: [] };
  const sessionA = await openPersistentDatabase({ store, sqlModule: harness.sqlModule, migrations });
  const sessionB = await openPersistentDatabase({ store, sqlModule: harness.sqlModule, migrations });
  return { sessionA, sessionB };
}
async function seedPersistentManga(db: Awaited<ReturnType<typeof createSqlJsHarness>>['db']) {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: 'Two Tab Progress',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'two-tab-progress',
    language: 'en',
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('seed failed');
  const { mangaId, mappingId } = created.value;
  const chapterId = toChapterId('chapter-two-tab');
  await upsertChapterWithPages(db, {
    chapterId,
    mangaId,
    providerMappingId: mappingId,
    title: 'Chapter 1',
    index: 1,
    pages: [{ id: toChapterPageId('page-two-tab'), index: 0, image: { url: 'https://example.com/1.jpg' } }],
  });
  await addLibraryEntry(db, { mangaId, status: 'reading' });
  return { mangaId, chapterId };
}
