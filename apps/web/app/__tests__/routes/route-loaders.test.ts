/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { QueryObserver } from '@tanstack/react-query';
import type { AppDrizzleDb } from '@app/db';
import { discoverQueryKeys } from '@/features/search';

const mocks = vi.hoisted(() => ({
  fetchAppSettings: vi.fn<() => Promise<{ settings: { explicitContent: boolean } }>>(),
  fetchDiscoverProviders: vi.fn<() => Promise<unknown>>(),
  fetchProviderSectionPreview:
    vi.fn<
      (db: unknown, providerId: string, sectionId: string, signal?: AbortSignal) => Promise<unknown>
    >(),
  fetchMangaDetail: vi.fn<() => Promise<unknown>>(),
  hasMangaRefreshJob: vi.fn<() => Promise<boolean>>(),
  enqueueMangaRefresh: vi.fn<() => Promise<void>>(),
  drainMangaRefreshQueue: vi.fn<() => Promise<void>>(),
}));

vi.mock('@/features/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAppSettings: mocks.fetchAppSettings,
}));
vi.mock('@/features/library', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchMangaDetail: mocks.fetchMangaDetail,
}));
vi.mock('../../lib/provider-registry.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getBindingForMangaId: () => ({}),
}));
vi.mock('../../lib/manga-refresh-queue.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasMangaRefreshJob: mocks.hasMangaRefreshJob,
  enqueueMangaRefresh: mocks.enqueueMangaRefresh,
  drainMangaRefreshQueue: mocks.drainMangaRefreshQueue,
}));
vi.mock('../../queries/provider-discover.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchDiscoverProviders: mocks.fetchDiscoverProviders,
  fetchProviderSectionPreview: mocks.fetchProviderSectionPreview,
}));

import { routeTree } from '../../routeTree.gen';
import { queryClient } from '../../providers/query-client.js';
import { setRouteDataDb } from '../../lib/route-data.js';
import { discoverPreviewQueryOptions } from '../../queries/discover-query-options.js';

const db = {} as AppDrizzleDb;
const providers = [
  { providerId: 'a', providerName: 'A', sections: [{ id: 'latest' }] },
  { providerId: 'b', providerName: 'B', sections: [{ id: 'new' }] },
];

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The app's routes on an in-memory history; nothing is rendered, the loaders run for real. */
async function routerAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return router;
}

const previewCalls = () => mocks.fetchProviderSectionPreview.mock.calls.map((call) => call[1]);

beforeEach(() => {
  setRouteDataDb(db);
  mocks.fetchAppSettings.mockResolvedValue({ settings: { explicitContent: false } });
  mocks.fetchDiscoverProviders.mockResolvedValue(providers);
  mocks.fetchProviderSectionPreview.mockResolvedValue({ results: [] });
  // A title with nothing saved: only its source can fill the page.
  mocks.fetchMangaDetail.mockResolvedValue(null);
  mocks.hasMangaRefreshJob.mockResolvedValue(false);
  mocks.enqueueMangaRefresh.mockResolvedValue(undefined);
  mocks.drainMangaRefreshQueue.mockResolvedValue(undefined);
});

afterEach(() => {
  setRouteDataDb(null);
  queryClient.clear();
  vi.clearAllMocks();
});

describe('route loaders on the app router', () => {
  it('Given the local database is not ready, Then entering Discover asks nothing', async () => {
    setRouteDataDb(null);
    await routerAt('/discover');
    expect(mocks.fetchDiscoverProviders).not.toHaveBeenCalled();
  });

  it('Given a navigation into Discover, While its feed loads, Then the page on screen stays resolved and Discover resolves with the feed in the cache', async () => {
    const router = await routerAt('/library');
    const read = deferred<unknown>();
    mocks.fetchDiscoverProviders.mockReturnValue(read.promise);

    const navigation = router.navigate({ to: '/discover' });
    await flush();
    expect(router.state.location.pathname).toBe('/discover');
    expect(router.state.resolvedLocation?.pathname).toBe('/library');

    read.resolve(providers);
    await navigation;
    expect(router.state.resolvedLocation?.pathname).toBe('/discover');
    expect(queryClient.getQueryData(discoverQueryKeys.preview('a', 'latest', false))).toEqual({
      results: [],
    });
  });

  it('Given Discover is open, When only the provider tab changes, Then the loader does not run again', async () => {
    const router = await routerAt('/discover');
    expect(previewCalls()).toEqual(['a']);

    await router.navigate({ to: '/discover', search: { provider: 'b' } });
    expect(router.state.resolvedLocation?.search).toEqual({ provider: 'b' });
    // The page fetches the new tab itself; the loader did not.
    expect(previewCalls()).toEqual(['a']);
    expect(mocks.fetchDiscoverProviders).toHaveBeenCalledTimes(1);
  });

  it('Given a preview that failed in the loader, When the page mounts, Then it gets the failure without a second request', async () => {
    mocks.fetchProviderSectionPreview.mockRejectedValue(new Error('offline'));
    await routerAt('/discover');
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);

    const observer = new QueryObserver(queryClient, {
      ...discoverPreviewQueryOptions(db, 'a', 'latest', false),
      enabled: true,
    });
    const unsubscribe = observer.subscribe(() => {});
    await flush();
    expect(observer.getCurrentResult().isError).toBe(true);
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);

    await observer.refetch();
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('Given a navigation into Discover abandoned for another page, Then no preview request starts after it', async () => {
    const router = await routerAt('/library');
    const read = deferred<unknown>();
    mocks.fetchDiscoverProviders.mockReturnValue(read.promise);

    void router.navigate({ to: '/discover' });
    await flush();
    await router.navigate({ to: '/search' });
    read.resolve(providers);
    await flush();
    await flush();

    expect(router.state.resolvedLocation?.pathname).toBe('/search');
    expect(mocks.fetchProviderSectionPreview).not.toHaveBeenCalled();
  });

  it('Given an abandoned navigation whose previews were in flight, Then their requests are cancelled', async () => {
    const router = await routerAt('/library');
    mocks.fetchProviderSectionPreview.mockReturnValue(new Promise(() => {}));

    void router.navigate({ to: '/discover' });
    await flush();
    await flush();
    const signal = mocks.fetchProviderSectionPreview.mock.calls[0]?.[3];
    expect(signal?.aborted).toBe(false);

    await router.navigate({ to: '/search' });
    await flush();
    expect(signal?.aborted).toBe(true);
  });

  it('Given Discover, then another page, When going back and forward, Then Discover reopens from the cache without asking the source again', async () => {
    const router = await routerAt('/discover');
    await router.navigate({ to: '/library' });
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);

    // Rendered, the router's Transitioner loads on every history change; here the test does.
    router.history.back();
    await router.load();
    expect(router.state.resolvedLocation?.pathname).toBe('/discover');

    router.history.forward();
    await router.load();
    expect(router.state.resolvedLocation?.pathname).toBe('/library');
    expect(mocks.fetchProviderSectionPreview).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDiscoverProviders).toHaveBeenCalledTimes(1);
  });

  it('Given a hover over a title with nothing saved, Then only the local read runs: nothing is queued and the source is not asked', async () => {
    const router = await routerAt('/library');
    await router.preloadRoute({ to: '/manga/$id', params: { id: 'manga-1' } });
    expect(mocks.fetchMangaDetail).toHaveBeenCalled();
    expect(mocks.enqueueMangaRefresh).not.toHaveBeenCalled();
    expect(mocks.drainMangaRefreshQueue).not.toHaveBeenCalled();
  });

  it('Given a hover that completed, When the title is clicked, Then its source refresh starts during the navigation, before the page mounts', async () => {
    const router = await routerAt('/library');
    await router.preloadRoute({ to: '/manga/$id', params: { id: 'manga-1' } });
    const drain = deferred<undefined>();
    mocks.drainMangaRefreshQueue.mockReturnValue(drain.promise);

    const navigation = router.navigate({ to: '/manga/$id', params: { id: 'manga-1' } });
    await flush();
    await flush();
    // Nothing is rendered here, so only the route loader can have started it.
    expect(router.state.resolvedLocation?.pathname).toBe('/library');
    expect(mocks.enqueueMangaRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.drainMangaRefreshQueue).toHaveBeenCalledTimes(1);

    drain.resolve(undefined);
    await navigation;
    expect(router.state.resolvedLocation?.pathname).toBe('/manga/manga-1');
  });
});
