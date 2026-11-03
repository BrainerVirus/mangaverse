// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { upsertChapterWithPages, upsertMangaIdentity } from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import {
  classifyAppError,
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
  mangaDetailRefreshQueryOptions,
  refreshMangaDetailForRoute,
  retryMangaDetailRefresh,
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

function sourceUnavailable(): Error {
  return Object.assign(new Error('HTTP 503 INTERNAL_SECRET upstream'), { status: 503 });
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

  it('Given nothing saved locally, When the source fails, Then the refresh rejects so the page can offer Retry', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    mocks.fetchProviderMangaDetail.mockRejectedValue(sourceUnavailable());

    const failure = await refreshMangaDetailForRoute(db, queryClient, MANGA_ID).catch(
      (error: unknown) => error,
    );

    expect(classifyAppError(failure).code).toBe('provider-unavailable');
    const [job] = await readMangaRefreshQueue(db);
    expect(job?.attempts).toBe(1);
    expect(job?.nextAttemptAt).toBeDefined();
  });

  it('Given a failed source still in backoff, When the page opens again, Then it still rejects with retryable copy', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    mocks.fetchProviderMangaDetail.mockRejectedValue(sourceUnavailable());
    await refreshMangaDetailForRoute(db, queryClient, MANGA_ID).catch(() => undefined);

    const failure = await refreshMangaDetailForRoute(db, queryClient, MANGA_ID).catch(
      (error: unknown) => error,
    );

    // The backoff skipped the provider, yet the page is not told the title is missing.
    expect(mocks.fetchProviderMangaDetail).toHaveBeenCalledTimes(1);
    const classified = classifyAppError(failure);
    expect(classified.code).toBe('provider-unavailable');
    expect(classified.retryable).toBe(true);
    expect(classified.message).not.toContain('INTERNAL_SECRET');
  });

  it('Given a cached title, When the source fails, Then the refresh stays silent over the cached data', async () => {
    const db = await seedLocal(false);
    const queryClient = new QueryClient();
    mocks.fetchProviderMangaDetail.mockRejectedValue(sourceUnavailable());

    await expect(refreshMangaDetailForRoute(db, queryClient, MANGA_ID)).resolves.toBe(true);
  });

  it('Given a failed source in backoff, When Retry runs, Then the provider is called now and the title loads', async () => {
    const { db: emptyDb } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    mocks.fetchProviderMangaDetail.mockRejectedValueOnce(sourceUnavailable());
    // The page's observer keeps the refresh query alive (its gcTime is 0).
    const observer = new QueryObserver(
      queryClient,
      mangaDetailRefreshQueryOptions(emptyDb, queryClient, MANGA_ID),
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));

    mocks.fetchProviderMangaDetail.mockResolvedValueOnce(refreshedDetail());
    await retryMangaDetailRefresh(emptyDb, queryClient, MANGA_ID);

    expect(mocks.fetchProviderMangaDetail).toHaveBeenCalledTimes(2);
    expect(observer.getCurrentResult().isSuccess).toBe(true);
    expect(await readMangaRefreshQueue(emptyDb)).toEqual([]);
    unsubscribe();
  });
});
