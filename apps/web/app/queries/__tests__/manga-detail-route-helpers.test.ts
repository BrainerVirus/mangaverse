// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addLibraryEntry,
  addProviderMapping,
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
  getMangaIdentity,
  refreshLibraryUnreadCount,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import type { ProviderUiInfo } from '@app/extensions';
import type { MangaDetailData } from '@app/library';
import {
  toChapterId,
  toMangaId,
  toProviderId,
  toProviderMappingId,
  type Chapter,
  type MangaId,
  type MangaIdentity,
  type MangaProviderMapping,
} from '@app/shared';
import {
  canHydrateChapters,
  chapterHydrationQueryKey,
  countChaptersForMapping,
  runProviderAction,
} from '../manga-detail-route-helpers.js';

const MANGA_ID = toMangaId('manga-1');

const provider: ProviderUiInfo = {
  id: 'prov-b',
  name: 'Provider B',
  enabled: true,
  capabilities: { 'metadata.chapters': true },
};

function chapterFor(mapping: MangaProviderMapping, id: string, index: number): Chapter {
  return {
    id: toChapterId(id),
    mangaId: MANGA_ID,
    providerMappingId: mapping.id,
    title: id,
    index,
    pages: [],
  };
}

function detailFor(
  mappings: readonly MangaProviderMapping[],
  chapters: readonly Chapter[],
  libraryEntry: MangaDetailData['libraryEntry'],
): MangaDetailData {
  const manga: MangaIdentity = {
    id: MANGA_ID,
    canonicalTitle: 'Manga One',
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: mappings,
    defaultProviderMappingId: mappings[0]!.id,
    merged: false,
  };
  return { manga, chapters, libraryEntry, continueChapterId: undefined };
}

async function seedHarness() {
  const harness = await createSqlJsHarness();
  const created = await createMangaIdentityWithInitialMapping(harness.db, {
    canonicalTitle: 'Manga One',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'remote-a',
  });
  if (!created.ok) throw new Error(created.error.message);
  const mappingA: MangaProviderMapping = {
    id: created.value.mappingId,
    providerId: toProviderId('prov-a'),
    providerMangaId: 'remote-a',
  };
  const added = await addProviderMapping(harness.db, {
    mangaId: created.value.mangaId,
    providerId: toProviderId('prov-b'),
    providerMangaId: 'remote-b',
  });
  if (!added.ok) throw new Error(added.error.message);
  const mappingB: MangaProviderMapping = {
    id: added.value,
    providerId: toProviderId('prov-b'),
    providerMangaId: 'remote-b',
  };
  return { ...harness, mangaId: created.value.mangaId, mappingA, mappingB };
}

async function seedChapter(
  db: Awaited<ReturnType<typeof createSqlJsHarness>>['db'],
  mangaId: MangaId,
  mapping: MangaProviderMapping,
  id: string,
  index: number,
): Promise<void> {
  const result = await upsertChapterWithPages(db, {
    chapterId: toChapterId(id),
    mangaId,
    providerMappingId: mapping.id,
    providerId: String(mapping.providerId),
    title: id,
    index,
    pages: [],
  });
  if (!result.ok) throw new Error(result.error.message);
}

describe('runProviderAction', () => {
  it('Given a library title, When selecting a mapping, Then it becomes active and the badge follows that mapping', async () => {
    const harness = await seedHarness();
    const { db, mangaId, mappingA, mappingB } = harness;
    await addLibraryEntry(db, { mangaId, status: 'reading' });
    await seedChapter(db, mangaId, mappingA, 'c-a1', 1);
    await seedChapter(db, mangaId, mappingA, 'c-a2', 2);
    await refreshLibraryUnreadCount(db, mangaId, mappingA.id);

    const detail = detailFor(
      [mappingA, mappingB],
      [chapterFor(mappingA, 'c-a1', 1), chapterFor(mappingA, 'c-a2', 2)],
      await getLibraryEntryForManga(db, mangaId),
    );

    await runProviderAction(db, mangaId, detail, { type: 'select', mappingId: mappingB.id });

    const entry = await getLibraryEntryForManga(db, mangaId);
    expect(entry?.activeProviderMappingId).toBe(mappingB.id);
    expect(entry?.unreadCount).toBe(0);
    expect((await getMangaIdentity(db, mangaId))?.preferredChapterSourceId).toBeUndefined();
  });

  it('Given a title outside the library, When selecting a mapping, Then the preferred source is stored', async () => {
    const { db, mangaId, mappingA, mappingB } = await seedHarness();
    const detail = detailFor([mappingA, mappingB], [], undefined);

    await runProviderAction(db, mangaId, detail, { type: 'select', mappingId: mappingB.id });

    expect((await getMangaIdentity(db, mangaId))?.preferredChapterSourceId).toBe(mappingB.id);
  });

  it('Given a mapping, When setting it as default, Then the identity default changes', async () => {
    const { db, mangaId, mappingB } = await seedHarness();

    await runProviderAction(db, mangaId, undefined, { type: 'default', mappingId: mappingB.id });

    expect((await getMangaIdentity(db, mangaId))?.defaultProviderMappingId).toBe(mappingB.id);
  });

  it('Given a library title, When choosing a chapter source, Then it is preferred and active', async () => {
    const { db, mangaId, mappingA, mappingB } = await seedHarness();
    await addLibraryEntry(db, { mangaId, status: 'reading' });
    const detail = detailFor([mappingA, mappingB], [], await getLibraryEntryForManga(db, mangaId));

    await runProviderAction(db, mangaId, detail, { type: 'preferred', mappingId: mappingB.id });

    const identity = await getMangaIdentity(db, mangaId);
    expect(identity?.preferredChapterSourceId).toBe(mappingB.id);
    expect((await getLibraryEntryForManga(db, mangaId))?.activeProviderMappingId).toBe(mappingB.id);
  });
});

describe('chapter hydration helpers', () => {
  it('only hydrates a ready, enabled provider that lacks local chapters', () => {
    const mapping: MangaProviderMapping = {
      id: toProviderMappingId('mapping-b'),
      providerId: toProviderId('prov-b'),
      providerMangaId: 'remote-b',
    };
    expect(canHydrateChapters(provider, mapping, true, false)).toBe(true);
    expect(canHydrateChapters(provider, mapping, true, true)).toBe(false);
    expect(canHydrateChapters(provider, mapping, false, false)).toBe(false);
    expect(canHydrateChapters(undefined, mapping, true, false)).toBe(false);
    expect(canHydrateChapters({ ...provider, enabled: false }, mapping, true, false)).toBe(false);
    expect(canHydrateChapters(provider, undefined, true, false)).toBe(false);
  });

  it('counts only the chapters attached to the given mapping', async () => {
    const { mappingA, mappingB } = await seedHarness();
    const data = detailFor(
      [mappingA, mappingB],
      [
        chapterFor(mappingA, 'c-a1', 1),
        chapterFor(mappingB, 'c-b1', 1),
        chapterFor(mappingB, 'c-b2', 2),
      ],
      undefined,
    );

    expect(countChaptersForMapping(data, mappingA)).toBe(1);
    expect(countChaptersForMapping(data, mappingB)).toBe(2);
    expect(countChaptersForMapping(data, undefined)).toBe(0);
    expect(countChaptersForMapping(undefined, mappingA)).toBe(0);
  });

  it('keeps the hydration key outside the library invalidations it triggers', async () => {
    const { mappingA } = await seedHarness();
    expect(chapterHydrationQueryKey(MANGA_ID, mappingA)[0]).not.toBe('library');
  });
});
