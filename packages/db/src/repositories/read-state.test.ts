import { describe, expect, it } from 'vitest';
import { toChapterId, toChapterPageId, toProviderId } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { createMangaIdentityWithInitialMapping } from './identities.js';
import { addProviderMapping } from './identities.js';
import { addLibraryEntry, getLibraryEntryForManga } from './library.js';
import { upsertChapterWithPages } from './chapters.js';
import {
  getChapterReadState,
  markPreviousChaptersCompleted,
  refreshLibraryUnreadCount,
  setChapterCompleted,
} from './read-state.js';

async function seed() {
  const { db, raw } = await createSqlJsHarness();
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: 'Read state fixture',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'read-state',
  });
  if (!created.ok) throw new Error(created.error.message);
  const { mangaId, mappingId } = created.value;
  await addLibraryEntry(db, { mangaId, status: 'reading' });

  const ids = [toChapterId('ch-1'), toChapterId('ch-2'), toChapterId('ch-3')];
  for (const [index, chapterId] of ids.entries()) {
    await upsertChapterWithPages(db, {
      chapterId,
      mangaId,
      providerMappingId: mappingId,
      providerId: 'prov-a',
      title: `Chapter ${index + 1}`,
      index: index + 1,
      pages: [0, 1].map((pageIndex) => ({
        id: toChapterPageId(`${chapterId}-${pageIndex}`),
        index: pageIndex,
        image: { url: `https://example.com/${chapterId}/${pageIndex}.jpg` },
      })),
    });
  }
  return { db, raw, mangaId, mappingId, ids };
}

describe('setChapterCompleted', () => {
  it('Given a chapter, When marking read then unread, Then progress and the library unread count both follow', async () => {
    const { db, raw, mangaId, mappingId, ids } = await seed();
    expect(await refreshLibraryUnreadCount(db, mangaId, mappingId)).toBe(3);

    expect((await setChapterCompleted(db, ids[1]!, true)).ok).toBe(true);
    expect(await getChapterReadState(db, ids[1]!)).toMatchObject({
      progress: { completed: true, readPercent: 100, lastPageIndex: 1 },
    });
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(2);

    // Unread clears the completion and the page, without the read timestamp
    // guard rejecting the backwards move.
    expect((await setChapterCompleted(db, ids[1]!, false)).ok).toBe(true);
    expect(await getChapterReadState(db, ids[1]!)).toMatchObject({
      progress: { completed: false, readPercent: 0, lastPageIndex: 0 },
    });
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(3);
    raw.close();
  });

  it('Given a missing chapter, When marking it read, Then it reports the missing chapter', async () => {
    const { db, raw } = await seed();
    const result = await setChapterCompleted(db, toChapterId('missing'), true);
    expect(result).toMatchObject({ ok: false, error: { code: 'db.read_state.chapter_missing' } });
    raw.close();
  });
});

describe('markPreviousChaptersCompleted', () => {
  it('Given a middle chapter open, When marking previous read, Then only earlier chapters of that mapping change and unread counts refresh', async () => {
    const { db, raw, mangaId, ids } = await seed();

    // A second mapping from the same provider must be left untouched.
    const second = await addProviderMapping(db, {
      mangaId,
      providerId: toProviderId('prov-a'),
      providerMangaId: 'read-state-second',
    });
    if (!second.ok) throw new Error(second.error.message);
    for (const index of [1, 2]) {
      await upsertChapterWithPages(db, {
        chapterId: toChapterId(`second-${index}`),
        mangaId,
        providerMappingId: second.value,
        providerId: 'prov-a',
        title: `Second ${index}`,
        index,
        pages: [],
      });
    }

    expect(await markPreviousChaptersCompleted(db, ids[2]!)).toMatchObject({
      ok: true,
      value: { updated: 2 },
    });
    expect((await getChapterReadState(db, ids[0]!))?.progress.completed).toBe(true);
    expect((await getChapterReadState(db, ids[1]!))?.progress.completed).toBe(true);
    expect(await getChapterReadState(db, ids[2]!)).toBeUndefined();
    expect(await getChapterReadState(db, toChapterId('second-1'))).toBeUndefined();
    expect(await getChapterReadState(db, toChapterId('second-2'))).toBeUndefined();
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(1);
    raw.close();
  });

  it('Given the first chapter open, When marking previous read, Then nothing is written', async () => {
    const { db, raw, mangaId, ids } = await seed();
    expect(await markPreviousChaptersCompleted(db, ids[0]!)).toMatchObject({
      ok: true,
      value: { updated: 0 },
    });
    expect((await getLibraryEntryForManga(db, mangaId))?.unreadCount).toBe(3);
    raw.close();
  });
});
