/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppDrizzleDb } from '@app/db';
import { toMangaId } from '@app/shared';
import { discoverQueryKeys } from '@/features/search';
import { libraryQueryKeys } from '@/features/library';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: unknown) => ({ options }),
}));

import { Route as DiscoverRoute } from '../../routes/discover.js';
import { Route as MangaRoute } from '../../routes/manga.$id.js';
import { queryClient } from '../../providers/query-client.js';
import { setRouteDataDb } from '../../lib/route-data.js';

type Loader = {
  staleReloadMode: string;
  handler: (context: unknown) => Promise<void> | undefined;
};
const discoverLoader = (DiscoverRoute.options as { loader: Loader }).loader.handler;
const mangaLoader = (MangaRoute.options as { loader: Loader }).loader.handler;

afterEach(() => {
  setRouteDataDb(null);
  vi.restoreAllMocks();
  queryClient.clear();
});

describe('route loaders', () => {
  it('Given a return to a page already visited, Then its loader waits for the warm-up too', () => {
    expect((DiscoverRoute.options as { loader: Loader }).loader.staleReloadMode).toBe('blocking');
    expect((MangaRoute.options as { loader: Loader }).loader.staleReloadMode).toBe('blocking');
  });

  it('Given the local database is not ready, Then the loaders do nothing and never hold the navigation', () => {
    const ensure = vi.spyOn(queryClient, 'ensureQueryData');
    expect(discoverLoader({ location: { search: {} } })).toBeUndefined();
    expect(mangaLoader({ params: { id: 'manga-1' } })).toBeUndefined();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('Given a ready database, Then Discover warms its providers in the app cache the page reads', async () => {
    setRouteDataDb({} as AppDrizzleDb);
    const ensure = vi.spyOn(queryClient, 'ensureQueryData').mockResolvedValue([] as never);
    await discoverLoader({ location: { search: {} } });
    expect(ensure.mock.calls.map(([options]) => options.queryKey)).toContainEqual(
      discoverQueryKeys.providers(),
    );
  });

  it('Given a ready database, Then the detail page warms its local read in the app cache', async () => {
    setRouteDataDb({} as AppDrizzleDb);
    const ensure = vi
      .spyOn(queryClient, 'ensureQueryData')
      .mockResolvedValue({ manga: {}, chapters: [] } as never);
    await mangaLoader({ params: { id: 'manga-1' } });
    expect(ensure.mock.calls[0]?.[0].queryKey).toEqual(
      libraryQueryKeys.detail(toMangaId('manga-1')),
    );
  });
});
