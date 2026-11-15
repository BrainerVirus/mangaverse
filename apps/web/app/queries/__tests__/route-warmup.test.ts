import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import type { AppDrizzleDb } from '@app/db';
import { toMangaId } from '@app/shared';
import { discoverQueryKeys } from '@/features/search';
import { libraryQueryKeys } from '@/features/library';
import { settingsQueryKeys } from '@/features/settings';

const mocks = vi.hoisted(() => ({
  bound: true,
  fetchAppSettings: vi.fn<() => Promise<{ settings: { explicitContent: boolean } }>>(),
  fetchDiscoverProviders: vi.fn<() => Promise<unknown>>(),
  fetchProviderSectionPreview:
    vi.fn<
      (
        db: unknown,
        providerId: string,
        sectionId: string,
        signal?: AbortSignal,
        explicit?: boolean,
      ) => Promise<unknown>
    >(),
  fetchMangaDetail: vi.fn<() => Promise<unknown>>(),
  hasMangaRefreshJob: vi.fn<() => Promise<boolean>>(),
  enqueueMangaRefresh: vi.fn<() => Promise<void>>(),
  drainMangaRefreshQueue:
    vi.fn<(db: unknown, client: unknown, options: { signal?: AbortSignal }) => Promise<void>>(),
}));

vi.mock('../../lib/provider-registry.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getBindingForMangaId: () => (mocks.bound ? {} : null),
}));
vi.mock('@/features/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAppSettings: mocks.fetchAppSettings,
}));
vi.mock('@/features/library', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchMangaDetail: mocks.fetchMangaDetail,
}));
vi.mock('../provider-discover.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDiscoverProviders: mocks.fetchDiscoverProviders,
  fetchProviderSectionPreview: mocks.fetchProviderSectionPreview,
}));
vi.mock('../../lib/manga-refresh-queue.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasMangaRefreshJob: mocks.hasMangaRefreshJob,
  enqueueMangaRefresh: mocks.enqueueMangaRefresh,
  drainMangaRefreshQueue: mocks.drainMangaRefreshQueue,
}));

import { discoverPreviewQueryOptions, warmDiscover } from '../discover-query-options.js';
import {
  localMangaDetailQueryOptions,
  mangaDetailRefreshQueryOptions,
  warmMangaDetail,
} from '../manga-detail-refresh.js';
import { waitForRouteData } from '../../lib/route-data.js';

const db = {} as AppDrizzleDb;
const MANGA_ID = toMangaId('manga-1');

const providers = [
  { providerId: 'mangadex', providerName: 'MangaDex', sections: [{ id: 'latest' }] },
  { providerId: 'other', providerName: 'Other', sections: [{ id: 'new' }] },
];

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let client: QueryClient;
const cleanups: (() => void)[] = [];

/** Mounts what the page mounts: an observer with the page's options, enabled. */
function observe(options: { queryKey: QueryKey }) {
  const observer = new QueryObserver(client, { ...options, enabled: true } as never);
  cleanups.push(observer.subscribe(() => {}));
  return observer;
}

beforeEach(() => {
  client = new QueryClient();
  mocks.bound = true;
  mocks.fetchAppSettings.mockResolvedValue({ settings: { explicitContent: false } });
  mocks.fetchDiscoverProviders.mockResolvedValue(providers);
  mocks.fetchProviderSectionPreview.mockResolvedValue({ results: [] });
  mocks.fetchMangaDetail.mockResolvedValue(null);
  mocks.hasMangaRefreshJob.mockResolvedValue(false);
  mocks.enqueueMangaRefresh.mockResolvedValue(undefined);
  mocks.drainMangaRefreshQueue.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  client.clear();
  vi.clearAllMocks();
});

const previewOf = (providerId: string, sectionId: string, explicit = false) =>
  discoverPreviewQueryOptions(db, providerId, sectionId, explicit);

describe('the Discover loader warm-up', () => {
  it('Given no provider in the URL, Then it warms settings, providers and the first provider’s previews under the page’s keys', async () => {
    mocks.fetchAppSettings.mockResolvedValue({ settings: { explicitContent: true } });
    await warmDiscover(client, db, {});
    const keys = client
      .getQueryCache()
      .findAll()
      .map((query) => query.queryKey);
    expect(keys).toEqual([
      settingsQueryKeys.app(),
      discoverQueryKeys.providers(),
      discoverQueryKeys.preview('mangadex', 'latest', true),
    ]);
  });

  it('Given a provider tab in the URL, Then that provider’s previews are warmed', async () => {
    await warmDiscover(client, db, { provider: 'other' });
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProviderSectionPreview.mock.calls[0]?.slice(1, 3)).toEqual(['other', 'new']);
  });

  it('Given settings fail, Then the previews are warmed for safe content, as the page shows them', async () => {
    mocks.fetchAppSettings.mockRejectedValue(new Error('settings'));
    await warmDiscover(client, db, {});
    expect(client.getQueryData(discoverQueryKeys.preview('mangadex', 'latest', false))).toEqual({
      results: [],
    });
  });

  it('Given a preview the warm-up failed, When the page mounts, Then it shows the failure without asking the source again, and Retry asks once more', async () => {
    mocks.fetchProviderSectionPreview.mockRejectedValue(new Error('offline'));
    await warmDiscover(client, db, {}).catch(() => undefined);
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);

    const observer = observe(previewOf('mangadex', 'latest'));
    await flush();
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isError).toBe(true);

    await observer.refetch();
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(2);
  });

  it('Given the loader is abandoned before the providers are read, Then no preview request starts', async () => {
    const read = deferred<unknown>();
    mocks.fetchDiscoverProviders.mockReturnValue(read.promise);
    const controller = new AbortController();
    const warm = warmDiscover(client, db, {}, controller.signal).catch(() => undefined);
    controller.abort();
    read.resolve(providers);
    await warm;
    await flush();
    expect(mocks.fetchProviderSectionPreview).not.toHaveBeenCalled();
  });

  it('Given previews in flight that no page shows, When the loader is abandoned, Then their requests are cancelled', async () => {
    mocks.fetchProviderSectionPreview.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const warm = warmDiscover(client, db, {}, controller.signal).catch(() => undefined);
    await flush();
    const signal = mocks.fetchProviderSectionPreview.mock.calls[0]?.[3];
    expect(signal?.aborted).toBe(false);
    controller.abort();
    await warm;
    expect(signal?.aborted).toBe(true);
    // Reverted, not failed: the next visit asks again instead of showing a cancellation.
    expect(client.getQueryState(previewOf('mangadex', 'latest').queryKey)?.status).toBe('pending');
  });

  it('Given a preview in flight that the mounted page now shows, When the loader is abandoned, Then the page keeps the same request', async () => {
    const preview = deferred<unknown>();
    mocks.fetchProviderSectionPreview.mockReturnValue(preview.promise);
    const controller = new AbortController();
    const warm = warmDiscover(client, db, {}, controller.signal).catch(() => undefined);
    await flush();
    const observer = observe(previewOf('mangadex', 'latest'));
    controller.abort();
    preview.resolve({ results: [] });
    await warm;
    await flush();
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProviderSectionPreview.mock.calls[0]?.[3]?.aborted).toBe(false);
    expect(observer.getCurrentResult().data).toEqual({ results: [] });
  });

  it('Given an expanded section, Then only the feed’s reads are warmed', async () => {
    await warmDiscover(client, db, { provider: 'mangadex', section: 'latest' });
    expect(mocks.fetchProviderSectionPreview).not.toHaveBeenCalled();
  });
});

describe('the manga detail loader warm-up', () => {
  const refreshOptions = () => mangaDetailRefreshQueryOptions(db, client, MANGA_ID);

  it('Given a title saved locally, Then only the local read is warmed: the source never holds the page', async () => {
    mocks.fetchMangaDetail.mockResolvedValue({ manga: {}, chapters: [] });
    await warmMangaDetail(client, db, MANGA_ID);
    expect(client.getQueryData(libraryQueryKeys.detail(MANGA_ID))).toEqual({
      manga: {},
      chapters: [],
    });
    expect(mocks.hasMangaRefreshJob).not.toHaveBeenCalled();
  });

  it('Given a hover (preload) on a title with nothing saved, Then it only reads locally: no refresh is queued', async () => {
    await warmMangaDetail(client, db, MANGA_ID, { preload: true });
    expect(mocks.fetchMangaDetail).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueMangaRefresh).not.toHaveBeenCalled();
    expect(mocks.drainMangaRefreshQueue).not.toHaveBeenCalled();
  });

  it('Given nothing saved and no source, Then nothing waits on a refresh', async () => {
    mocks.bound = false;
    await warmMangaDetail(client, db, MANGA_ID);
    expect(mocks.enqueueMangaRefresh).not.toHaveBeenCalled();
  });

  it('Given a navigation that completes, When the page mounts mid-refresh, Then it reuses the request in flight', async () => {
    const drain = deferred<void>();
    mocks.drainMangaRefreshQueue.mockReturnValue(drain.promise);
    const warm = warmMangaDetail(client, db, MANGA_ID, { signal: new AbortController().signal });
    await flush();
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(1);
    const observer = observe(refreshOptions());
    drain.resolve();
    await warm;
    await flush();
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });

  it('Given the loader is abandoned during the local reads, Then nothing is queued and the source is not asked', async () => {
    const read = deferred<unknown>();
    mocks.fetchMangaDetail.mockReturnValue(read.promise);
    const controller = new AbortController();
    const warm = warmMangaDetail(client, db, MANGA_ID, { signal: controller.signal }).catch(
      () => undefined,
    );
    controller.abort();
    read.resolve(null);
    await warm;
    await flush();
    expect(mocks.enqueueMangaRefresh).not.toHaveBeenCalled();
    expect(mocks.drainMangaRefreshQueue).not.toHaveBeenCalled();
  });

  it('Given the loader is abandoned while the refresh reads the queue, Then the refresh writes nothing', async () => {
    const queued = deferred<boolean>();
    mocks.hasMangaRefreshJob.mockReturnValue(queued.promise);
    const controller = new AbortController();
    const warm = warmMangaDetail(client, db, MANGA_ID, { signal: controller.signal }).catch(
      () => undefined,
    );
    await flush();
    expect(mocks.hasMangaRefreshJob).toHaveBeenCalledTimes(1);
    controller.abort();
    queued.resolve(false);
    await warm;
    await flush();
    expect(mocks.enqueueMangaRefresh).not.toHaveBeenCalled();
    expect(mocks.drainMangaRefreshQueue).not.toHaveBeenCalled();
  });

  it('Given a refresh the warm-up failed, When the page mounts, Then it shows the failure without a second source call, and Retry asks again', async () => {
    mocks.drainMangaRefreshQueue.mockImplementation(
      async (_db, _client, _options, deps?: { log: (error: unknown) => void }) => {
        deps?.log(new Error('offline'));
      },
    );
    const warm = warmMangaDetail(client, db, MANGA_ID).catch(() => undefined);
    // The page mounts while the navigation finishes, as the router commits it.
    const observer = observe(refreshOptions());
    await warm;
    await flush();
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isError).toBe(true);

    await observer.refetch();
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(2);
  });

  it('Given a refresh the warm-up failed that settled before the page mounts, Then the page shows the failure without a second source call', async () => {
    mocks.drainMangaRefreshQueue.mockImplementation(
      async (_db, _client, _options, deps?: { log: (error: unknown) => void }) => {
        deps?.log(new Error('offline'));
      },
    );
    await warmMangaDetail(client, db, MANGA_ID).catch(() => undefined);
    // The navigation committed later than a garbage-collection tick.
    await flush();
    await flush();

    const observer = observe(refreshOptions());
    await flush();
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isError).toBe(true);
  });

  it('Given a refresh the warm-up finished before the page mounts, Then the page takes it over without a second check', async () => {
    await warmMangaDetail(client, db, MANGA_ID);
    await flush();
    await flush();
    const checks = mocks.hasMangaRefreshJob.mock.calls.length;
    const observer = observe(refreshOptions());
    await flush();
    expect(mocks.hasMangaRefreshJob.mock.calls.length).toBe(checks);
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });

  it('Given a title with nothing saved, When it is left and opened again within seconds, Then the refresh is checked again', async () => {
    await warmMangaDetail(client, db, MANGA_ID);
    observe(refreshOptions());
    await flush();
    for (const cleanup of cleanups.splice(0)) cleanup();
    const drains = mocks.drainMangaRefreshQueue.mock.calls.length;

    // Reopened: the route loader runs again for the new visit, then the page mounts.
    await warmMangaDetail(client, db, MANGA_ID);
    observe(refreshOptions());
    await flush();
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(drains + 1);
  });

  it('Given a saved title, When it is left and opened again within seconds, Then the page checks the refresh again (a refresh queued meanwhile is seen)', async () => {
    mocks.fetchMangaDetail.mockResolvedValue({ manga: {}, chapters: [] });
    await warmMangaDetail(client, db, MANGA_ID);
    observe(refreshOptions());
    await flush();
    for (const cleanup of cleanups.splice(0)) cleanup();
    const checks = mocks.hasMangaRefreshJob.mock.calls.length;

    mocks.hasMangaRefreshJob.mockResolvedValue(true);
    await warmMangaDetail(client, db, MANGA_ID);
    observe(refreshOptions());
    await flush();
    expect(mocks.hasMangaRefreshJob.mock.calls.length).toBeGreaterThan(checks);
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalled();
  });

  it('Given a local read the warm-up failed, When the page mounts, Then it is not read twice', async () => {
    mocks.fetchMangaDetail.mockRejectedValue(new Error('sqlite'));
    await warmMangaDetail(client, db, MANGA_ID).catch(() => undefined);
    observe(localMangaDetailQueryOptions(db, MANGA_ID));
    await flush();
    expect(mocks.fetchMangaDetail).toHaveBeenCalledTimes(1);
  });
});

describe('waitForRouteData', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Given quick data, Then the navigation goes on as soon as it is in', async () => {
    await expect(waitForRouteData(Promise.resolve('data'), 10_000)).resolves.toBeUndefined();
  });

  it('Given slow data, Then the navigation goes on after the wait, with the read still running', async () => {
    vi.useFakeTimers();
    let settled = false;
    const wait = waitForRouteData(new Promise(() => {}), 400).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(399);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(settled).toBe(true);
  });

  it('Given a failed read, Then the navigation goes on and the page shows the failure', async () => {
    await expect(
      waitForRouteData(Promise.reject(new Error('offline')), 10_000),
    ).resolves.toBeUndefined();
  });
});
