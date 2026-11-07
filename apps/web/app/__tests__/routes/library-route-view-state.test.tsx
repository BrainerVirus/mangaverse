/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LibraryModule from '@/features/library';
import type { LibraryViewState } from '@app/shared';

const mocks = vi.hoisted(() => ({
  useSearch: vi.fn<() => Record<string, unknown>>(),
  navigate: vi.fn<(options: unknown) => void>(),
}));

let pageProps: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: mocks.useSearch }),
  useNavigate: () => mocks.navigate,
  useRouterState: (opts?: { select?: (state: { location: { state: object } }) => unknown }) => {
    const state = { location: { state: { __TSR_index: 0 } } };
    return opts?.select ? opts.select(state) : state;
  },
}));

vi.mock('@/features/library', async (importOriginal) => {
  const actual = await importOriginal<typeof LibraryModule>();
  return {
    ...actual,
    LibraryPage: (props: Record<string, unknown>) => {
      pageProps = props;
      return <div data-testid="library-page" />;
    },
    useLibraryList: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      items: null,
      total: 0,
      hasMore: false,
      loadMore: () => Promise.resolve(),
    }),
  };
});

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => null,
  useLocalDbStatus: () => 'loading',
  useLocalDbRetry: () => () => {},
}));

vi.mock('../../lib/local-db.js', () => ({
  subscribeToLocalChanges: () => () => {},
}));

import { Route } from '../../routes/library.js';

const LibraryRoute = Route.options.component;

if (LibraryRoute === undefined) {
  throw new Error('The /library route must expose its component.');
}

describe('/library route view state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    pageProps = {};
    mocks.useSearch.mockReturnValue({});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <LibraryRoute />
        </QueryClientProvider>,
      );
    });
  }

  it('Given the URL after Back or reload, Then filter, sort, category and layout are restored', async () => {
    mocks.useSearch.mockReturnValue({
      layout: 'list',
      sort: 'title:asc',
      q: 'berserk',
      category: ['category-1'],
      status: ['reading'],
      favorites: true,
      provider: ['mangadex'],
    });

    await render();

    expect(pageProps.viewState).toEqual({
      layout: 'list',
      sort: { key: 'title', direction: 'asc' },
      filter: {
        query: 'berserk',
        categoryIds: ['category-1'],
        statuses: ['reading'],
        favoritesOnly: true,
        providerIds: ['mangadex'],
      },
    } satisfies LibraryViewState);
  });

  it('Given the default URL, Then the default view is used', async () => {
    await render();

    expect(pageProps.viewState).toEqual({
      layout: 'grid',
      sort: { key: 'date_added', direction: 'desc' },
      filter: {},
    });
  });

  it('Given a view change, Then the URL is replaced with only the restorable fields', async () => {
    await render();
    const onChange = pageProps.onViewStateChange as (next: LibraryViewState) => void;

    await act(async () => {
      onChange({
        layout: 'grid',
        sort: { key: 'title', direction: 'asc' },
        filter: { statuses: ['completed'] },
      });
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      search: { sort: 'title:asc', status: ['completed'] },
      replace: true,
      resetScroll: false,
    });
    // Replacing keeps the list on one history entry, so Back leaves the page.
    expect(mocks.navigate).not.toHaveBeenCalledWith(expect.objectContaining({ replace: false }));
  });

  it('Given a category tab, Then the category is part of the URL contract', async () => {
    await render();
    const onChange = pageProps.onViewStateChange as (next: LibraryViewState) => void;

    await act(async () => {
      onChange({
        layout: 'grid',
        sort: { key: 'date_added', direction: 'desc' },
        filter: { categoryIds: ['category-2'] },
      });
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: { category: ['category-2'] },
        replace: true,
      }),
    );
  });
});
