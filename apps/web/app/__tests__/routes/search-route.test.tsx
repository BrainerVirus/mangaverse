/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as SearchModule from '@app/search';
import type * as SettingsModule from '@app/settings';
import type { MangaIdentity } from '@app/shared';
import type { SearchPageData, SearchViewState } from '@app/search';
import { settingsQueryKeys } from '@app/settings';

const mocks = vi.hoisted(() => ({
  fetchSearchPage: vi.fn<(db: unknown, viewState: SearchViewState) => Promise<SearchPageData>>(),
  fetchProviderSearchIdentities:
    vi.fn<(db: unknown, query: string, signal: AbortSignal) => Promise<readonly MangaIdentity[]>>(),
  fetchAppSettings: vi.fn<(db: unknown) => Promise<{ settings: { explicitContent: boolean } }>>(),
  recordSearchQuery: vi.fn<(db: unknown, query: string) => Promise<void>>(),
  navigate: vi.fn<(options: unknown) => void>(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@app/search', async (importOriginal) => {
  const actual = await importOriginal<typeof SearchModule>();
  return {
    ...actual,
    fetchSearchPage: mocks.fetchSearchPage,
    recordSearchQuery: mocks.recordSearchQuery,
  };
});

vi.mock('@app/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return { ...actual, fetchAppSettings: mocks.fetchAppSettings };
});

const db = {};

vi.mock('../../lib/local-db.js', () => ({
  getLocalDb: () => db,
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => db,
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => vi.fn<() => void>(),
}));

vi.mock('../../queries/provider-query-options.js', () => ({
  fetchProviderSearchIdentities: mocks.fetchProviderSearchIdentities,
}));

import { Route } from '../../routes/search.js';

// VirtualSearchGrid measures its container; jsdom has no ResizeObserver.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const SearchRoute = Route.options.component;

if (SearchRoute === undefined) {
  throw new Error('The /search route must expose its component.');
}

function makeIdentity(title: string): MangaIdentity {
  return {
    id: `manga-${title}` as MangaIdentity['id'],
    canonicalTitle: title,
    alternativeTitles: [],
    authors: [],
    artists: [],
    tags: [],
    status: 'ongoing',
    contentRating: 'safe',
    providerMappings: [],
    defaultProviderMappingId: 'map-1' as MangaIdentity['defaultProviderMappingId'],
    merged: false,
  };
}

function localPage(viewState: SearchViewState): SearchPageData {
  const query = viewState.query.trim();
  return {
    results: query.length > 0 ? [makeIdentity(`Local ${query}`)] : [],
    recentSearches: [{ id: 'recent-1', query: 'berserk', searchedAt: '2026-10-20T00:00:00Z' }],
    viewState,
  };
}

function emptyPage(viewState: SearchViewState): SearchPageData {
  return { results: [], recentSearches: [], viewState };
}

describe('/search route', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAppSettings.mockResolvedValue({ settings: { explicitContent: false } });
    mocks.fetchSearchPage.mockImplementation((_db, viewState: SearchViewState) =>
      Promise.resolve(localPage(viewState)),
    );
    mocks.fetchProviderSearchIdentities.mockResolvedValue([]);
    mocks.recordSearchQuery.mockResolvedValue(undefined);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SearchRoute />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function setQuery(value: string) {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) throw new Error('Missing search input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function buttonByText(label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  }

  function providerStatus(): Element | null {
    return container.querySelector('output');
  }

  function searchGrid(): Element | null {
    return container.querySelector('section[aria-label="Search results"]');
  }

  it('Given local results, When the provider is slow, Then local results render before the provider answers', async () => {
    let resolveProvider!: (identities: readonly MangaIdentity[]) => void;
    mocks.fetchProviderSearchIdentities.mockImplementation(
      () =>
        new Promise<readonly MangaIdentity[]>((resolve) => {
          resolveProvider = resolve;
        }),
    );

    await act(async () => setQuery('berserk'));

    await vi.waitFor(() => expect(buttonByText('Local berserk')).toBeDefined());
    await vi.waitFor(() => expect(providerStatus()?.textContent).toContain('Searching providers…'));
    expect(container.textContent).not.toContain('No results found');

    await act(async () => {
      resolveProvider([makeIdentity('LOCAL BERSERK'), makeIdentity('Provider Series')]);
    });

    await vi.waitFor(() => expect(buttonByText('Provider Series')).toBeDefined());
    const grid = searchGrid();
    expect(grid).not.toBeNull();
    if (grid === null) return;
    const berserkButtons = [...grid.querySelectorAll('button')].filter((button) =>
      /berserk/i.test(button.textContent ?? ''),
    );
    expect(berserkButtons).toHaveLength(1);
    expect(providerStatus()).toBeNull();
  });

  it('Given a provider failure, Then local results stay visible with a quiet retryable notice', async () => {
    mocks.fetchProviderSearchIdentities.mockRejectedValue(new Error('provider offline'));

    await act(async () => setQuery('berserk'));

    await vi.waitFor(() => expect(buttonByText('Local berserk')).toBeDefined());
    await vi.waitFor(() =>
      expect(providerStatus()?.textContent).toContain('Provider search unavailable'),
    );

    expect(buttonByText('Local berserk')).toBeDefined();
    expect(buttonByText('Retry')).toBeDefined();
    expect(container.textContent).not.toContain('Could not load search');
    expect(container.textContent).not.toContain('No results found');
  });

  it('Given no local matches and a provider failure, Then a distinct provider-unavailable state offers Retry', async () => {
    mocks.fetchSearchPage.mockImplementation((_db, viewState: SearchViewState) =>
      Promise.resolve(emptyPage(viewState)),
    );
    mocks.fetchProviderSearchIdentities.mockRejectedValue(new Error('provider offline'));

    await act(async () => setQuery('berserk'));

    await vi.waitFor(() => expect(container.textContent).toContain('Provider search unavailable'));
    expect(buttonByText('Retry')).toBeDefined();
    expect(container.textContent).not.toContain('No results found');
    expect(container.textContent).not.toContain('Could not load search');
  });

  it('Given no local matches and a slow provider, Then the empty state waits for the provider', async () => {
    mocks.fetchSearchPage.mockImplementation((_db, viewState: SearchViewState) =>
      Promise.resolve(emptyPage(viewState)),
    );
    let resolveProvider!: (identities: readonly MangaIdentity[]) => void;
    mocks.fetchProviderSearchIdentities.mockImplementation(
      () =>
        new Promise<readonly MangaIdentity[]>((resolve) => {
          resolveProvider = resolve;
        }),
    );

    await act(async () => setQuery('berserk'));

    await vi.waitFor(() => expect(providerStatus()?.textContent).toContain('Searching providers…'));
    expect(container.textContent).not.toContain('No results found');
    expect(container.textContent).not.toContain('Provider search unavailable');

    await act(async () => {
      resolveProvider([]);
    });

    await vi.waitFor(() => expect(container.textContent).toContain('No results found'));
  });

  it('Given a failed provider search with no local matches, When Retry runs, Then only the provider refetches', async () => {
    mocks.fetchSearchPage.mockImplementation((_db, viewState: SearchViewState) =>
      Promise.resolve(emptyPage(viewState)),
    );
    mocks.fetchProviderSearchIdentities
      .mockRejectedValueOnce(new Error('provider offline'))
      .mockResolvedValueOnce([makeIdentity('Provider Series')]);

    await act(async () => setQuery('berserk'));

    await vi.waitFor(() => expect(buttonByText('Retry')).toBeDefined());
    const localReads = mocks.fetchSearchPage.mock.calls.length;
    const recordedQueries = mocks.recordSearchQuery.mock.calls.length;

    await act(async () => {
      buttonByText('Retry')?.click();
    });

    await vi.waitFor(() => expect(buttonByText('Provider Series')).toBeDefined());
    expect(mocks.fetchProviderSearchIdentities).toHaveBeenCalledTimes(2);
    expect(mocks.fetchSearchPage).toHaveBeenCalledTimes(localReads);
    expect(mocks.recordSearchQuery).toHaveBeenCalledTimes(recordedQueries);
    expect(container.textContent).not.toContain('Provider search unavailable');
  });

  it('Given a blank query, Then no provider request is made', async () => {
    await vi.waitFor(() => expect(buttonByText('berserk')).toBeDefined());

    expect(mocks.fetchProviderSearchIdentities).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'Given explicit content is %s, When a pending history write finishes after clearing, Then fresh recents render',
    async (explicitContent) => {
      await vi.waitFor(() => expect(buttonByText('berserk')).toBeDefined());
      await act(async () => {
        queryClient.setQueryData(settingsQueryKeys.app(), { settings: { explicitContent } });
      });

      let savedQuery = 'berserk';
      let finishWrite!: () => void;
      mocks.fetchSearchPage.mockImplementation((_db, viewState) =>
        Promise.resolve({
          ...localPage(viewState),
          recentSearches: [
            { id: 'recent-1', query: savedQuery, searchedAt: '2026-10-20T00:00:00Z' },
          ],
        }),
      );
      mocks.recordSearchQuery.mockImplementation(
        (_db, query) =>
          new Promise<void>((resolve) => {
            finishWrite = () => {
              savedQuery = query;
              resolve();
            };
          }),
      );

      await act(async () => setQuery('naruto'));
      await vi.waitFor(() => expect(buttonByText('Local naruto')).toBeDefined());
      await act(async () => setQuery(''));
      await vi.waitFor(() => expect(buttonByText('berserk')).toBeDefined());
      const providerCalls = mocks.fetchProviderSearchIdentities.mock.calls.length;

      await act(async () => finishWrite());

      await vi.waitFor(() => expect(buttonByText('naruto')).toBeDefined());
      expect(buttonByText('berserk')).toBeUndefined();
      expect(mocks.fetchProviderSearchIdentities).toHaveBeenCalledTimes(providerCalls);
    },
  );

  it('Given a slow provider, When the query clears, Then recent searches render without waiting', async () => {
    let resolveProvider!: (identities: readonly MangaIdentity[]) => void;
    mocks.fetchProviderSearchIdentities.mockImplementation(
      () =>
        new Promise<readonly MangaIdentity[]>((resolve) => {
          resolveProvider = resolve;
        }),
    );

    await act(async () => setQuery('berserk'));
    await vi.waitFor(() => expect(buttonByText('Local berserk')).toBeDefined());

    await act(async () => setQuery(''));

    await vi.waitFor(() => expect(buttonByText('berserk')).toBeDefined());
    expect(providerStatus()).toBeNull();

    await act(async () => {
      resolveProvider([]);
    });
  });

  it('Given a pending provider request, When the query changes, Then the old request is aborted', async () => {
    const signals: AbortSignal[] = [];
    mocks.fetchProviderSearchIdentities.mockImplementation(
      (_db: unknown, _query: string, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise<readonly MangaIdentity[]>(() => {});
      },
    );

    await act(async () => setQuery('berserk'));
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    await act(async () => setQuery('naruto'));

    await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
  });

  it('Given a slow local read for the next query, When typing, Then previous results stay on screen', async () => {
    let resolveNext!: (page: SearchPageData) => void;
    mocks.fetchSearchPage.mockImplementation((_db, viewState: SearchViewState) => {
      if (viewState.query === 'naruto') {
        return new Promise<SearchPageData>((resolve) => (resolveNext = resolve));
      }
      return Promise.resolve(localPage(viewState));
    });

    await act(async () => setQuery('berserk'));
    await vi.waitFor(() => expect(buttonByText('Local berserk')).toBeDefined());

    await act(async () => setQuery('naruto'));
    await vi.waitFor(() =>
      expect(mocks.fetchSearchPage).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ query: 'naruto' }),
      ),
    );

    // The grid is not replaced by a loading state while the next read runs.
    expect(buttonByText('Local berserk')).toBeDefined();

    await act(async () => resolveNext(localPage({ query: 'naruto' })));
    await vi.waitFor(() => expect(buttonByText('Local naruto')).toBeDefined());
  });

  it('Given app settings still loading, When a query is typed, Then local results are not gated', async () => {
    act(() => root.unmount());
    mocks.fetchAppSettings.mockImplementation(() => new Promise(() => {}));
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <SearchRoute />
        </QueryClientProvider>,
      );
    });

    await act(async () => setQuery('berserk'));

    await vi.waitFor(() => expect(buttonByText('Local berserk')).toBeDefined());
    expect(mocks.fetchProviderSearchIdentities).not.toHaveBeenCalled();
  });
});
