import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  getChapterReadState,
  getLibraryEntryForManga,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import {
  toCategoryId,
  toChapterId,
  toChapterPageId,
  toProviderId,
  type ChapterId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import { markPreviousChaptersRead, setChapterRead } from './library-actions.js';

async function seed(harness: Awaited<ReturnType<typeof createSqlJsHarness>>): Promise<{
  mangaId: MangaId;
  mappingId: ProviderMappingId;
}> {
  const created = await createMangaIdentityWithInitialMapping(harness.db, {
    canonicalTitle: 'Chapter Actions',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'chapter-actions-1',
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

async function chapter(
  harness: Awaited<ReturnType<typeof createSqlJsHarness>>,
  mangaId: MangaId,
  mappingId: ProviderMappingId,
  id: string,
  index: number,
): Promise<ChapterId> {
  const chapterId = toChapterId(id);
  const result = await upsertChapterWithPages(harness.db, {
    chapterId,
    mangaId,
    providerMappingId: mappingId,
    title: `Chapter ${index}`,
    index,
    pages: [0, 1, 2].map((pageIndex) => ({
      id: toChapterPageId(`${id}-p${pageIndex}`),
      index: pageIndex,
      image: { url: `https://example.com/${id}/${pageIndex}.jpg` },
    })),
  });
  if (!result.ok) throw new Error(result.error.message);
  return chapterId;
}

describe('chapter read actions', () => {
  it('marks a chapter read with full progress and refreshes the unread count', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seed(harness);
    const added = await addLibraryEntry(harness.db, { mangaId, status: 'reading' });
    expect(added.ok).toBe(true);
    const first = await chapter(harness, mangaId, mappingId, 'c-1', 1);
    await chapter(harness, mangaId, mappingId, 'c-2', 2);

    const result = await setChapterRead(harness.db, mangaId, first, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(1);

    const state = await getChapterReadState(harness.db, first);
    expect(state?.progress).toMatchObject({
      completed: true,
      readPercent: 100,
      lastPageIndex: 2,
    });
    expect((await getLibraryEntryForManga(harness.db, mangaId))?.unreadCount).toBe(1);
  });

  it('marks a chapter unread by clearing completion and page progress', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seed(harness);
    await addLibraryEntry(harness.db, { mangaId, status: 'reading' });
    const first = await chapter(harness, mangaId, mappingId, 'c-1', 1);

    await setChapterRead(harness.db, mangaId, first, true);
    const result = await setChapterRead(harness.db, mangaId, first, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(1);
    expect((await getChapterReadState(harness.db, first))?.progress).toMatchObject({
      completed: false,
      readPercent: 0,
      lastPageIndex: 0,
    });
  });

  it('marks only earlier chapters of the same provider mapping read', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seed(harness);
    await addLibraryEntry(harness.db, { mangaId, status: 'reading' });
    await chapter(harness, mangaId, mappingId, 'c-1', 1);
    await chapter(harness, mangaId, mappingId, 'c-2', 2);
    const third = await chapter(harness, mangaId, mappingId, 'c-3', 3);

    const result = await markPreviousChaptersRead(harness.db, mangaId, third);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(1);

    expect((await getChapterReadState(harness.db, toChapterId('c-1')))?.progress.completed).toBe(
      true,
    );
    expect((await getChapterReadState(harness.db, toChapterId('c-2')))?.progress.completed).toBe(
      true,
    );
    expect(await getChapterReadState(harness.db, third)).toBeUndefined();
  });

  it('preserves favorite, categories and resume metadata through read actions', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seed(harness);
    const added = await addLibraryEntry(harness.db, { mangaId, status: 'reading' });
    if (!added.ok) throw new Error(added.error.message);
    harness.raw.run(
      "UPDATE library_entries SET favorite = 1, last_read_chapter_id = 'c-1', progress_percent = 42 WHERE id = ?",
      [added.value],
    );
    harness.raw.run("INSERT INTO categories (id, name, pinned) VALUES ('cat-1', 'Action', 0)");
    harness.raw.run(
      "INSERT INTO library_category_memberships (library_entry_id, category_id) VALUES (?, 'cat-1')",
      [added.value],
    );
    const first = await chapter(harness, mangaId, mappingId, 'c-1', 1);

    await setChapterRead(harness.db, mangaId, first, true);

    const entry = await getLibraryEntryForManga(harness.db, mangaId);
    expect(entry?.favorite).toBe(true);
    expect(entry?.categoryIds).toEqual([toCategoryId('cat-1')]);
    expect(entry?.lastReadChapterId).toBe(first);
    expect(entry?.progressPercent).toBe(42);
  });

  it('returns a typed error for a chapter outside the title', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId } = await seed(harness);
    const other = await createMangaIdentityWithInitialMapping(harness.db, {
      canonicalTitle: 'Other',
      status: 'ongoing',
      contentRating: 'safe',
      providerId: toProviderId('prov-b'),
      providerMangaId: 'other-1',
    });
    if (!other.ok) throw new Error(other.error.message);
    const foreign = await chapter(
      harness,
      other.value.mangaId,
      other.value.mappingId,
      'foreign-1',
      1,
    );

    const result = await setChapterRead(harness.db, mangaId, foreign, true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('db.read_state.chapter_missing');
  });
});
