// @vitest-environment node
// Regression for issue #298: a background provider refresh must not discard
// local state written while the provider call was pending.
import { describe, expect, it, vi } from 'vitest';
import {
  addLibraryEntry,
  createMangaIdentityWithInitialMapping,
  upsertChapterReadState,
  upsertChapterWithPages,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { toChapterId, toProviderId } from '@app/shared';
import { fetchMangaDetail } from '@/features/library';
import type * as ExtensionsModule from '@app/extensions';
import type * as ProviderRegistryModule from '../../lib/provider-registry.js';
import type { ProviderAppBinding } from '../../lib/provider-registry.js';

const controls = vi.hoisted(() => ({
  getDetails: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('../../lib/provider-registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderRegistryModule>()),
  resolveInstalledProvider: async () => ({ manifest: {}, getDetails: controls.getDetails }),
}));
vi.mock('@app/extensions', async (importOriginal) => ({
  ...(await importOriginal<typeof ExtensionsModule>()),
  loadProviderSettings: async () => ({}),
  applyExplicitContentGate: (value: unknown) => value,
}));

import { fetchProviderMangaDetail } from '../provider-query-options.js';

const CHAPTER_ID = toChapterId('chapter-298');

async function seedManga() {
  const { db } = await createSqlJsHarness();
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: 'Title',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('p'),
    providerMangaId: 'id',
    language: 'en',
  });
  if (!created.ok) throw new Error('seed failed');
  const chapter = await upsertChapterWithPages(db, {
    chapterId: CHAPTER_ID,
    mangaId: created.value.mangaId,
    providerMappingId: created.value.mappingId,
    title: 'Chapter 1',
    index: 1,
    pages: [],
  });
  if (!chapter.ok) throw new Error('chapter seed failed');
  return { db, mangaId: created.value.mangaId, mappingId: created.value.mappingId };
}

/** Starts a refresh whose provider call stays pending until `release` is called. */
async function startPendingRefresh() {
  const { db, mangaId, mappingId } = await seedManga();
  const before = await fetchMangaDetail(db, mangaId);
  if (before === null) throw new Error('seed missing');
  // The snapshot is past the stale window, so the refresh really calls the provider.
  const stale = { ...before, manga: { ...before.manga, updatedAt: '2000-01-01T00:00:00.000Z' } };

  let release!: (value: unknown) => void;
  controls.getDetails.mockReset();
  controls.getDetails.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const binding = {
    providerId: 'p',
    parseAppMangaId: () => 'id',
    toMangaDetailData: () => before,
  } as unknown as ProviderAppBinding;
  const pending = fetchProviderMangaDetail(db, binding, mangaId, stale);
  await vi.waitFor(() => expect(controls.getDetails).toHaveBeenCalled());
  return { db, mangaId, mappingId, pending, release: () => release({}) };
}

describe('provider detail refresh keeps local writes (issue #298)', () => {
  it('Given a library add during a pending provider fetch, When the refresh resolves, Then the entry is still in the detail', async () => {
    const { db, mangaId, pending, release } = await startPendingRefresh();

    await addLibraryEntry(db, { mangaId, status: 'reading' });
    expect((await fetchMangaDetail(db, mangaId))?.libraryEntry).toBeDefined();
    release();
    const result = await pending;

    expect(result?.libraryEntry).toBeDefined();
  });

  it('Given reading progress saved during a pending provider fetch, When the refresh resolves, Then the detail carries that read state', async () => {
    const { db, mangaId, mappingId, pending, release } = await startPendingRefresh();

    await upsertChapterReadState(db, {
      chapterId: CHAPTER_ID,
      mangaId,
      providerMappingId: mappingId,
      progress: {
        readPercent: 100,
        lastPageIndex: 3,
        completed: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    release();
    const result = await pending;

    expect(
      result?.readStates?.find((state) => state.chapterId === CHAPTER_ID)?.progress,
    ).toMatchObject({ completed: true, lastPageIndex: 3 });
  });
});
