import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { AppDrizzleDb } from '@app/db';
import { toMangaId } from '@app/shared';
import { discoverQueryKeys } from '@/features/search';
import { libraryQueryKeys } from '@/features/library';
import { settingsQueryKeys } from '@/features/settings';

const mocks = vi.hoisted(() => ({ bound: true }));

vi.mock('../../lib/provider-registry.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getBindingForMangaId: () => (mocks.bound ? {} : null),
}));

import { warmDiscover } from '../discover-query-options.js';
import { warmMangaDetail } from '../manga-detail-refresh.js';
import { waitForRouteData } from '../../lib/route-data.js';

const db = {} as AppDrizzleDb;
const MANGA_ID = toMangaId('manga-1');

const providers = [
  {
    providerId: 'mangadex',
    providerName: 'MangaDex',
    sections: [{ id: 'latest' }, { id: 'popular' }],
  },
  { providerId: 'other', providerName: 'Other', sections: [{ id: 'new' }] },
];

/** A client whose reads answer from `answers` by key, recording every key the warm-up asks for. */
function clientAnswering(answers: (key: readonly unknown[]) => unknown) {
  const client = new QueryClient();
  const ensure = vi
    .spyOn(client, 'ensureQueryData')
    .mockImplementation(async (options) => answers(options.queryKey) as never);
  const keys = () => ensure.mock.calls.map(([options]) => options.queryKey);
  return { client, ensure, keys };
}

const sameKey = (a: readonly unknown[], b: readonly unknown[]) =>
  JSON.stringify(a) === JSON.stringify(b);

describe('the Discover loader warm-up', () => {
  function discoverAnswers(explicitContent: boolean) {
    return (key: readonly unknown[]) => {
      if (sameKey(key, settingsQueryKeys.app())) return { settings: { explicitContent } };
      if (sameKey(key, discoverQueryKeys.providers())) return providers;
      return { results: [] };
    };
  }

  it('Given no provider in the URL, Then it reads settings and providers, then the first provider’s previews with the page’s keys', async () => {
    const { client, keys } = clientAnswering(discoverAnswers(true));
    await warmDiscover(client, db, {});
    expect(keys()).toEqual([
      settingsQueryKeys.app(),
      discoverQueryKeys.providers(),
      discoverQueryKeys.preview('mangadex', 'latest', true),
      discoverQueryKeys.preview('mangadex', 'popular', true),
    ]);
  });

  it('Given a provider tab in the URL, Then that provider’s previews are warmed', async () => {
    const { client, keys } = clientAnswering(discoverAnswers(false));
    await warmDiscover(client, db, { provider: 'other' });
    expect(keys().slice(2)).toEqual([discoverQueryKeys.preview('other', 'new', false)]);
  });

  it('Given settings fail, Then the previews are warmed for safe content, as the page shows them', async () => {
    const { client, keys } = clientAnswering((key) => {
      if (sameKey(key, settingsQueryKeys.app())) throw new Error('settings');
      return discoverAnswers(true)(key);
    });
    await warmDiscover(client, db, {});
    expect(keys().slice(2)).toEqual([
      discoverQueryKeys.preview('mangadex', 'latest', false),
      discoverQueryKeys.preview('mangadex', 'popular', false),
    ]);
  });

  it('Given an expanded section, Then only the feed’s reads are warmed', async () => {
    const { client, keys } = clientAnswering(discoverAnswers(false));
    await warmDiscover(client, db, { provider: 'mangadex', section: 'latest' });
    expect(keys()).toHaveLength(2);
  });
});

describe('the manga detail loader warm-up', () => {
  beforeEach(() => {
    mocks.bound = true;
  });

  it('Given a title saved locally, Then only the local read is warmed: the source never holds the page', async () => {
    const { client, keys } = clientAnswering(() => ({ manga: {}, chapters: [] }));
    await warmMangaDetail(client, db, MANGA_ID);
    expect(keys()).toEqual([libraryQueryKeys.detail(MANGA_ID)]);
  });

  it('Given nothing saved and a source, Then the first refresh is warmed too and outlives the gap to the page', async () => {
    const { client, ensure, keys } = clientAnswering((key) =>
      sameKey(key, libraryQueryKeys.detail(MANGA_ID)) ? null : true,
    );
    await warmMangaDetail(client, db, MANGA_ID);
    expect(keys()).toEqual([libraryQueryKeys.detail(MANGA_ID), ['manga-detail-refresh', MANGA_ID]]);
    expect(ensure.mock.calls[1]?.[0].gcTime).toBeGreaterThan(0);
  });

  it('Given nothing saved and no source, Then nothing waits on a refresh', async () => {
    mocks.bound = false;
    const { client, keys } = clientAnswering(() => null);
    await warmMangaDetail(client, db, MANGA_ID);
    expect(keys()).toEqual([libraryQueryKeys.detail(MANGA_ID)]);
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
