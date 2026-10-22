import { describe, expect, it } from 'vitest';
import {
  toChapterId,
  toLibraryEntryId,
  toProviderId,
  toProviderMappingId,
  type ChapterId,
  type MangaId,
  type ProviderMappingId,
} from '@app/shared';
import { createSqlJsHarness, type SqlJsHarness } from '../testing/sqljs-harness.js';
import {
  addProviderMapping,
  createMangaIdentityWithInitialMapping,
  getMangaIdentity,
  setMangaCoverOverride,
  setPreferredChapterSource,
} from './identities.js';
import {
  addLibraryEntry,
  getLibraryEntryForManga,
  setLibraryEntryActiveProviderMapping,
} from './library.js';
import { upsertChapterWithPages } from './chapters.js';
import {
  listChapterReadStatesForManga,
  refreshLibraryUnreadCount,
  setChapterCompleted,
  upsertChapterReadState,
} from './read-state.js';

async function seedManga(
  harness: SqlJsHarness,
): Promise<{ mangaId: MangaId; mappingId: ProviderMappingId }> {
  const created = await createMangaIdentityWithInitialMapping(harness.db, {
    canonicalTitle: 'Detail State',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'detail-state-1',
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

async function seedChapter(
  harness: SqlJsHarness,
  mangaId: MangaId,
  mappingId: ProviderMappingId,
  providerId: string,
  id: string,
  index: number,
): Promise<ChapterId> {
  const chapterId = toChapterId(id);
  const result = await upsertChapterWithPages(harness.db, {
    chapterId,
    mangaId,
    providerMappingId: mappingId,
    providerId,
    title: `Chapter ${index}`,
    index,
    pages: [],
  });
  if (!result.ok) throw new Error(result.error.message);
  return chapterId;
}

function markCompleted(
  harness: SqlJsHarness,
  mangaId: MangaId,
  mappingId: ProviderMappingId,
  chapterId: ChapterId,
): Promise<unknown> {
  return upsertChapterReadState(harness.db, {
    chapterId,
    mangaId,
    providerMappingId: mappingId,
    progress: {
      readPercent: 100,
      lastPageIndex: 4,
      completed: true,
      updatedAt: new Date().toISOString(),
    },
  });
}

describe('manga detail state repositories', () => {
  it('lists and clears read states for one title', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seedManga(harness);
    const first = await seedChapter(harness, mangaId, mappingId, 'prov-a', 'c-1', 1);
    const second = await seedChapter(harness, mangaId, mappingId, 'prov-a', 'c-2', 2);

    await markCompleted(harness, mangaId, mappingId, first);
    await upsertChapterReadState(harness.db, {
      chapterId: second,
      mangaId,
      providerMappingId: mappingId,
      progress: { readPercent: 40, lastPageIndex: 1, completed: false },
    });

    const states = await listChapterReadStatesForManga(harness.db, mangaId);
    expect(
      states
        .map((state) => [String(state.chapterId), state.progress.completed] as const)
        .sort((left, right) => left[0].localeCompare(right[0])),
    ).toEqual([
      [String(first), true],
      [String(second), false],
    ]);

    await setChapterCompleted(harness.db, first, false);
    const afterUnmark = await listChapterReadStatesForManga(harness.db, mangaId);
    expect(
      afterUnmark
        .map((state) => [String(state.chapterId), state.progress.completed] as const)
        .sort((left, right) => left[0].localeCompare(right[0])),
    ).toEqual([
      [String(first), false],
      [String(second), false],
    ]);
  });

  it('counts unread chapters only from the active provider mapping', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seedManga(harness);
    const added = await addLibraryEntry(harness.db, {
      mangaId,
      status: 'reading',
      id: toLibraryEntryId('entry-detail-state'),
    });
    expect(added.ok).toBe(true);

    const first = await seedChapter(harness, mangaId, mappingId, 'prov-a', 'c-1', 1);
    await seedChapter(harness, mangaId, mappingId, 'prov-a', 'c-2', 2);
    await markCompleted(harness, mangaId, mappingId, first);

    expect(await refreshLibraryUnreadCount(harness.db, mangaId, mappingId)).toBe(1);

    const other = await addProviderMapping(harness.db, {
      mangaId,
      providerId: toProviderId('prov-b'),
      providerMangaId: 'detail-state-2',
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    await seedChapter(harness, mangaId, other.value, 'prov-b', 'c-3', 1);
    await seedChapter(harness, mangaId, other.value, 'prov-b', 'c-4', 2);
    await seedChapter(harness, mangaId, other.value, 'prov-b', 'c-5', 3);

    const entry = await getLibraryEntryForManga(harness.db, mangaId);
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const switched = await setLibraryEntryActiveProviderMapping(harness.db, entry.id, other.value);
    expect(switched.ok).toBe(true);

    expect(await refreshLibraryUnreadCount(harness.db, mangaId, other.value)).toBe(3);
    const refreshed = await getLibraryEntryForManga(harness.db, mangaId);
    expect(refreshed?.unreadCount).toBe(3);
    expect(refreshed?.favorite).toBe(false);
    expect(refreshed?.status).toBe('reading');

    // A second mapping from the same provider must not leak into this mapping's
    // count; provider-scoped counting would report 5 here.
    const sameProvider = await addProviderMapping(harness.db, {
      mangaId,
      providerId: toProviderId('prov-b'),
      providerMangaId: 'detail-state-3',
    });
    expect(sameProvider.ok).toBe(true);
    if (!sameProvider.ok) return;
    await seedChapter(harness, mangaId, sameProvider.value, 'prov-b', 'c-6', 1);
    await seedChapter(harness, mangaId, sameProvider.value, 'prov-b', 'c-7', 2);
    expect(await refreshLibraryUnreadCount(harness.db, mangaId, other.value)).toBe(3);
    expect(await refreshLibraryUnreadCount(harness.db, mangaId, sameProvider.value)).toBe(2);
  });

  it('sets and clears the preferred chapter source with a mapping guard', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId, mappingId } = await seedManga(harness);

    const set = await setPreferredChapterSource(harness.db, mangaId, mappingId);
    expect(set.ok).toBe(true);
    expect((await getMangaIdentity(harness.db, mangaId))?.preferredChapterSourceId).toBe(mappingId);

    const missing = await setPreferredChapterSource(
      harness.db,
      mangaId,
      toProviderMappingId('missing-map'),
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe('db.identity.mapping_not_found');

    const cleared = await setPreferredChapterSource(harness.db, mangaId, undefined);
    expect(cleared.ok).toBe(true);
    expect((await getMangaIdentity(harness.db, mangaId))?.preferredChapterSourceId).toBeUndefined();
  });

  it('sets, replaces and removes a custom cover without dropping other overrides', async () => {
    const harness = await createSqlJsHarness();
    const { mangaId } = await seedManga(harness);

    const set = await setMangaCoverOverride(harness.db, mangaId, 'https://example.com/a.jpg');
    expect(set.ok).toBe(true);
    expect((await getMangaIdentity(harness.db, mangaId))?.userOverrides?.coverImageUrl).toBe(
      'https://example.com/a.jpg',
    );

    harness.raw.run('UPDATE manga_identities SET user_overrides_json = ? WHERE id = ?', [
      JSON.stringify({ title: 'My title', coverImageUrl: 'https://example.com/a.jpg' }),
      mangaId,
    ]);

    const invalid = await setMangaCoverOverride(harness.db, mangaId, 'ftp://example.com/a.jpg');
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.code).toBe('db.identity.invalid_cover_url');

    const removed = await setMangaCoverOverride(harness.db, mangaId, undefined);
    expect(removed.ok).toBe(true);
    expect((await getMangaIdentity(harness.db, mangaId))?.userOverrides).toEqual({
      title: 'My title',
    });
  });
});
