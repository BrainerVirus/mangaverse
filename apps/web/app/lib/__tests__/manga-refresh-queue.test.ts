// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  createMangaIdentityWithInitialMapping,
  getLibraryEntryForManga,
  upsertAppSetting,
} from '@app/db';
import { createSqlJsHarness } from '@app/db/testing';
import { libraryQueryKeys, type MangaDetailData } from '@/features/library';
import {
  toLibraryEntryId,
  toProviderId,
  toMangaId,
  toProviderMangaId,
  toProviderMappingId,
  type MangaId,
} from '@app/shared';

import {
  MAX_MANGA_REFRESH_JOBS,
  MANGA_REFRESH_QUEUE_KEY,
  drainMangaRefreshQueue,
  enqueueMangaRefresh,
  mangaRefreshBackoffMs,
  readMangaRefreshQueue,
} from '../manga-refresh-queue.js';
import { createAddToLibraryMutationOptions } from '../../queries/library-mutation-options.js';

const mangaId = toMangaId('manga-refresh-1');
const mappingId = toProviderMappingId('mapping-refresh-1');

function detailFor(id: MangaId): MangaDetailData {
  return {
    manga: {
      id,
      canonicalTitle: 'Refresh Target',
      alternativeTitles: [],
      authors: [],
      artists: [],
      tags: [],
      status: 'ongoing',
      contentRating: 'safe',
      providerMappings: [
        {
          id: mappingId,
          providerId: toProviderId('prov-a'),
          providerMangaId: toProviderMangaId('remote-1'),
        },
      ],
      defaultProviderMappingId: mappingId,
      merged: false,
    },
    chapters: [],
    libraryEntry: undefined,
    continueChapterId: undefined,
  };
}

async function seedIdentity(db: Parameters<typeof enqueueMangaRefresh>[0]) {
  const created = await createMangaIdentityWithInitialMapping(db, {
    canonicalTitle: 'Refresh Target',
    status: 'ongoing',
    contentRating: 'safe',
    providerId: toProviderId('prov-a'),
    providerMangaId: 'remote-1',
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.mangaId;
}

describe('manga refresh queue', () => {
  it('dedupes by manga, keeping one job and its attempt count', async () => {
    const { db } = await createSqlJsHarness();

    await enqueueMangaRefresh(db, mangaId, 'detail');
    await enqueueMangaRefresh(db, mangaId, 'add');
    await enqueueMangaRefresh(db, mangaId, 'add');

    const jobs = await readMangaRefreshQueue(db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ mangaId, reason: 'add', attempts: 0 });
  });

  it('bounds the queue by dropping the oldest jobs', async () => {
    const { db } = await createSqlJsHarness();

    for (let index = 0; index < MAX_MANGA_REFRESH_JOBS + 5; index += 1) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- bounded unit fixture; ordering is the assertion
      await enqueueMangaRefresh(db, toMangaId(`manga-${index}`), 'add');
    }

    const jobs = await readMangaRefreshQueue(db);
    expect(jobs).toHaveLength(MAX_MANGA_REFRESH_JOBS);
    expect(jobs[0]?.mangaId).toBe('manga-5');
    expect(jobs.at(-1)?.mangaId).toBe(`manga-${MAX_MANGA_REFRESH_JOBS + 4}`);
  });

  it('backs off exponentially and caps the wait', () => {
    expect(mangaRefreshBackoffMs(0)).toBe(0);
    expect(mangaRefreshBackoffMs(1)).toBe(15_000);
    expect(mangaRefreshBackoffMs(2)).toBe(30_000);
    expect(mangaRefreshBackoffMs(3)).toBe(60_000);
    expect(mangaRefreshBackoffMs(20)).toBe(30 * 60_000);
  });

  it('removes the job and writes the refreshed detail into the open cache on success', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    queryClient.setQueryData(libraryQueryKeys.detail(mangaId), null);
    await enqueueMangaRefresh(db, mangaId, 'detail');

    const refreshed = detailFor(mangaId);
    await drainMangaRefreshQueue(db, queryClient, {}, { refresh: async () => refreshed });

    expect(await readMangaRefreshQueue(db)).toEqual([]);
    expect(queryClient.getQueryData(libraryQueryKeys.detail(mangaId))).toEqual(refreshed);
  });

  it('keeps the job with backoff and logs when the provider fails', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    const log = vi.fn<(error: unknown) => void>();
    const refresh = vi.fn<(db: unknown, id: MangaId) => Promise<MangaDetailData | null>>(
      async () => {
        throw new Error('provider offline');
      },
    );
    await enqueueMangaRefresh(db, mangaId, 'detail', () => 1_000);

    await drainMangaRefreshQueue(db, queryClient, {}, { refresh, log, now: () => 1_000 });

    const [job] = await readMangaRefreshQueue(db);
    expect(job).toMatchObject({ mangaId, attempts: 1 });
    expect(job?.nextAttemptAt).toBe(new Date(16_000).toISOString());
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'provider offline' }));

    // The stored backoff is respected: a due-time drain does not call again.
    await drainMangaRefreshQueue(db, queryClient, {}, { refresh, log, now: () => 1_001 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('resumes a persisted job after a reload and clears it once the provider recovers', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    await enqueueMangaRefresh(db, mangaId, 'add');

    // A reload only keeps the settings row; a fresh read is the resume point.
    const resumed = await readMangaRefreshQueue(db);
    expect(resumed.map((job) => job.mangaId)).toEqual([mangaId]);

    await drainMangaRefreshQueue(
      db,
      queryClient,
      { force: true },
      { refresh: async () => detailFor(mangaId) },
    );

    expect(await readMangaRefreshQueue(db)).toEqual([]);
  });

  it('reads an unknown version or malformed row as an empty queue', async () => {
    const { db } = await createSqlJsHarness();

    await upsertAppSetting(db, MANGA_REFRESH_QUEUE_KEY, {
      version: 99,
      jobs: [{ mangaId, reason: 'detail', enqueuedAt: 'now', attempts: 0 }],
    });
    expect(await readMangaRefreshQueue(db)).toEqual([]);

    await upsertAppSetting(db, MANGA_REFRESH_QUEUE_KEY, 'not a queue');
    expect(await readMangaRefreshQueue(db)).toEqual([]);
  });

  it('Given an offline add, When the provider fails, Then the local entry and the queued refresh both survive', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    const targetId = await seedIdentity(db);
    const log = vi.fn<(error: unknown) => void>();

    const options = createAddToLibraryMutationOptions(db, queryClient, targetId);
    await options.mutationFn(toLibraryEntryId('entry-offline'));

    expect(await getLibraryEntryForManga(db, targetId)).toBeDefined();
    expect(await readMangaRefreshQueue(db)).toHaveLength(1);

    await drainMangaRefreshQueue(
      db,
      queryClient,
      {},
      {
        log,
        refresh: async () => {
          throw new Error('provider offline');
        },
      },
    );

    // The entry is durable and the job is still queued for the next drain.
    expect(await getLibraryEntryForManga(db, targetId)).toBeDefined();
    expect((await readMangaRefreshQueue(db))[0]).toMatchObject({ mangaId: targetId, attempts: 1 });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('marks a job exhausted after the attempt limit and only a forced drain retries it', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    const log = vi.fn<(error: unknown) => void>();
    const refresh = vi.fn<(db: unknown, id: MangaId) => Promise<MangaDetailData | null>>(
      async () => {
        throw new Error('still offline');
      },
    );
    await enqueueMangaRefresh(db, mangaId, 'detail');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- the attempt count and exhaustion flag are the assertion
      await drainMangaRefreshQueue(
        db,
        queryClient,
        { force: true },
        { refresh, log, now: () => 1_000 },
      );
    }

    const [job] = await readMangaRefreshQueue(db);
    expect(job?.attempts).toBe(5);
    expect(job?.exhausted).toBe(true);

    // A normal drain respects the limit and stays quiet.
    await drainMangaRefreshQueue(db, queryClient, {}, { refresh, log, now: () => 2_000 });
    expect(refresh).toHaveBeenCalledTimes(5);

    // Startup/reconnect is a fresh chance and can clear it.
    await drainMangaRefreshQueue(
      db,
      queryClient,
      { force: true },
      { refresh: async () => detailFor(mangaId), log, now: () => 3_000 },
    );
    expect(await readMangaRefreshQueue(db)).toEqual([]);
  });

  it('leaves the job untouched when the drain is cancelled', async () => {
    const { db } = await createSqlJsHarness();
    const queryClient = new QueryClient();
    const refresh = vi.fn<(db: unknown, id: MangaId) => Promise<MangaDetailData | null>>(
      async (_db, id) => detailFor(id),
    );
    await enqueueMangaRefresh(db, mangaId, 'detail');

    const controller = new AbortController();
    controller.abort();
    await drainMangaRefreshQueue(db, queryClient, { signal: controller.signal }, { refresh });

    expect(refresh).not.toHaveBeenCalled();
    expect(await readMangaRefreshQueue(db)).toHaveLength(1);
  });
});
