// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { upsertChapterWithPages, upsertMangaIdentity } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import {
  toChapterId,
  toMangaId,
  toProviderId,
  toProviderMangaId,
  toProviderMappingId,
} from '@app/shared';
import type { MangaDetailData } from '@/features/library';

const mocks = vi.hoisted(() => ({
  fetchProviderMangaDetail: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('../provider-query-options.js', () => ({
  fetchProviderMangaDetail: mocks.fetchProviderMangaDetail,
}));

import { readMangaRefreshQueue } from '../../lib/manga-refresh-queue.js';
import {
  localMangaDetailQueryOptions,
  refreshMangaDetailForRoute,
} from '../manga-detail-refresh.js';

const MANGA_ID = toMangaId('dev-md-11111111-1111-4111-8111-111111111111');
const PROVIDER_MANGA_ID = '11111111-1111-4111-8111-111111111111';
const MAPPING_ID = toProviderMappingId('mapping-local-first');

async function seedLocal(withChapter: boolean) {
  const { db } = await createSqlJsHarness();
  await upsertMangaIdentity(db, {
    id: MANGA_ID,
    canonicalTitle: 'Local First',
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [
      {
        id: MAPPING_ID,
        providerId: toProviderId('mangadex'),
        providerMangaId: toProviderMangaId(PROVIDER_MANGA_ID),
      },
    ],
    defaultProviderMappingId: MAPPING_ID,
    merged: false,
  });

  if (withChapter) {
    const written = await upsertChapterWithPages(db, {
      chapterId: toChapterId('dev-md-ch-11111111-1111-4111-8111-111111111111'),
      mangaId: MANGA_ID,
      providerMappingId: MAPPING_ID,
      providerId: 'mangadex',
      title: 'Chapter 1',
      index: 1,
      pages: [],
    });
    if (!written.ok) throw new Error(written.error.message);
  }
  return db;
}

function refreshedDetail(): MangaDetailData {
  return {
    manga: {
      id: MANGA_ID,
      canonicalTitle: 'Local First Refreshed',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      providerMappings: [
        {
          id: MAPPING_ID,
          providerId: toProviderId('mangadex'),
          providerMangaId: toProviderMangaId(PROVIDER_MANGA_ID),
        },
      ],
      defaultProviderMappingId: MAPPING_ID,
      merged: false,
    },
    chapters: [],
    libraryEntry: undefined,
    continueChapterId: undefined,
  };
}

describe('manga detail local-first split', () => {
  beforeEach(() => {
    mocks.fetchProviderMangaDetail.mockReset();
  });

  it('Given local chapters, When the detail read runs, Then it resolves from SQLite without a provider call', async () => {
    const db = await seedLocal(true);
    const queryClient = new QueryClient();

    const detail = await queryClient.fetchQuery(localMangaDetailQueryOptions(db, MANGA_ID));

    expect(detail?.manga.id).toBe(MANGA_ID);
    expect(detail?.chapters).toHaveLength(1);
    expect(mocks.fetchProviderMangaDetail).not.toHaveBeenCalled();
  });

  it('Given a cached chapter list, When the background refresh runs, Then it skips the provider and queues nothing', async () => {
    const db = await seedLocal(true);
    const queryClient = new QueryClient();

    await expect(refreshMangaDetailForRoute(db, queryClient, MANGA_ID)).resolves.toBe(false);

    expect(mocks.fetchProviderMangaDetail).not.toHaveBeenCalled();
    expect(await readMangaRefreshQueue(db)).toEqual([]);
  });

  it('Given no local chapters, When the background refresh runs, Then it persists and writes the detail into the open cache', async () => {
    const db = await seedLocal(false);
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(localMangaDetailQueryOptions(db, MANGA_ID));
    mocks.fetchProviderMangaDetail.mockResolvedValue(refreshedDetail());

    await expect(refreshMangaDetailForRoute(db, queryClient, MANGA_ID)).resolves.toBe(true);

    expect(mocks.fetchProviderMangaDetail).toHaveBeenCalledTimes(1);
    expect(await readMangaRefreshQueue(db)).toEqual([]);
    expect(
      (await queryClient.ensureQueryData(localMangaDetailQueryOptions(db, MANGA_ID)))?.manga
        .canonicalTitle,
    ).toBe('Local First Refreshed');
  });

  it('Given a provider that never resolves, When the surface reads local data, Then it renders without waiting', async () => {
    const db = await seedLocal(false);
    const queryClient = new QueryClient();
    const controller = new AbortController();

    mocks.fetchProviderMangaDetail.mockImplementation(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          const signal = args[4] as AbortSignal | undefined;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const refresh = refreshMangaDetailForRoute(db, queryClient, MANGA_ID, controller.signal);
    await vi.waitFor(() => expect(mocks.fetchProviderMangaDetail).toHaveBeenCalledTimes(1));

    // The provider call is pending, yet the local read has already resolved.
    const local = await queryClient.fetchQuery(localMangaDetailQueryOptions(db, MANGA_ID));
    expect(local?.manga.id).toBe(MANGA_ID);
    expect(local?.chapters).toEqual([]);

    controller.abort();
    await refresh;
    // A cancelled background refresh keeps the job for the next drain.
    expect(await readMangaRefreshQueue(db)).toHaveLength(1);
  });
});
