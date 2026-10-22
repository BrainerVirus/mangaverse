import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { toChapterId, toProviderMappingId } from '@app/shared';
import { createSqlJsHarness } from '../testing/sqljs-harness.js';
import { libraryEntries, mangaProviderMappings } from '../schema.js';
import { createMangaIdentityWithInitialMapping } from './identities.js';
import { addLibraryEntry, getLibraryEntryForManga } from './library.js';
import { getLibraryChapterStats, recomputeLibraryUnreadCounts } from './library-activity.js';
import { upsertChapterReadState } from './read-state.js';
import { upsertChapterWithPages } from './chapters.js';

async function setup() {
  const harness = await createSqlJsHarness();
  const created = await createMangaIdentityWithInitialMapping(harness.db, {
    canonicalTitle: 'Activity Title',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: 'prov-a',
    providerMangaId: 'activity-remote',
  });
  if (!created.ok) throw new Error('identity setup failed');
  await addLibraryEntry(harness.db, { mangaId: created.value.mangaId, status: 'reading' });
  const entry = await getLibraryEntryForManga(harness.db, created.value.mangaId);
  if (entry === undefined) throw new Error('entry setup failed');
  return { ...harness, created: created.value, entry };
}

describe('library chapter activity', () => {
  it('counts unread chapters in the active provider mapping only', async () => {
    const { db, created, entry } = await setup();
    const secondMapping = toProviderMappingId('map-second');
    db.insert(mangaProviderMappings)
      .values({
        id: secondMapping,
        mangaId: created.mangaId,
        providerId: 'prov-b',
        providerMangaId: 'activity-remote-b',
      })
      .run();

    for (const index of [1, 2, 3]) {
      await upsertChapterWithPages(db, {
        chapterId: toChapterId(`other-${index}`),
        mangaId: created.mangaId,
        providerMappingId: created.mappingId,
        title: `Other ${index}`,
        index,
        pages: [],
      });
    }
    await upsertChapterWithPages(db, {
      chapterId: toChapterId('active-1'),
      mangaId: created.mangaId,
      providerMappingId: created.mappingId,
      title: 'Active 1',
      index: 1,
      pages: [],
    });

    db.update(libraryEntries)
      .set({ activeProviderMappingId: secondMapping })
      .where(eq(libraryEntries.id, entry.id))
      .run();
    const switched = await getLibraryEntryForManga(db, entry.mangaId);
    if (switched === undefined) throw new Error('missing entry');
    // A mapping with no local chapters falls back to all known chapters, so the
    // title is never reported as empty just because the provider was switched.
    let stats = await getLibraryChapterStats(db, [switched]);
    expect(stats.get(switched.id)?.unreadCount).toBe(3);

    await upsertChapterWithPages(db, {
      chapterId: toChapterId('second-1'),
      mangaId: created.mangaId,
      providerMappingId: secondMapping,
      title: 'Second 1',
      index: 1,
      pages: [],
    });

    stats = await getLibraryChapterStats(db, [switched]);
    expect(stats.get(switched.id)).toMatchObject({
      chapterCount: 1,
      unreadCount: 1,
      latestChapter: { title: 'Second 1', index: 1 },
    });
  });

  it('persists the live unread count without touching the resume timestamp', async () => {
    const { db, created, entry } = await setup();

    for (const index of [1, 2]) {
      const chapterId = toChapterId(`chapter-${index}`);
      await upsertChapterWithPages(db, {
        chapterId,
        mangaId: created.mangaId,
        providerMappingId: created.mappingId,
        title: `Chapter ${index}`,
        index,
        pages: [],
      });
      await upsertChapterReadState(db, {
        chapterId,
        mangaId: created.mangaId,
        progress: {
          readPercent: 100,
          lastPageIndex: 1,
          completed: index === 1,
          updatedAt: `2026-01-0${index}T00:00:00.000Z`,
        },
      });
    }

    const unread = await recomputeLibraryUnreadCounts(db, [entry]);
    expect(unread.get(entry.id)).toBe(1);

    const stored = db.select().from(libraryEntries).where(eq(libraryEntries.id, entry.id)).get();
    expect(stored?.unreadCount).toBe(1);
    expect(stored?.updatedAt).toBe(entry.updatedAt);
  });

  it('keeps a restored unread count when there are no local chapters', async () => {
    const { db, entry } = await setup();
    db.update(libraryEntries).set({ unreadCount: 4 }).where(eq(libraryEntries.id, entry.id)).run();

    const restored = await getLibraryEntryForManga(db, entry.mangaId);
    if (restored === undefined) throw new Error('missing entry');
    const unread = await recomputeLibraryUnreadCounts(db, [restored]);
    expect(unread.get(restored.id)).toBe(4);
  });
});
