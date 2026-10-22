/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ExtensionsModule from '@app/extensions';
import type { ExtensionsPageData } from '@app/extensions';
import { searchQueryKeys } from '@app/search';
import type { AppResult } from '@app/shared';

const mocks = vi.hoisted(() => ({
  fetchExtensionsPage: vi.fn<() => Promise<ExtensionsPageData>>(),
  setProviderEnabled:
    vi.fn<(db: unknown, providerId: string, enabled: boolean) => Promise<AppResult<void>>>(),
  navigate: vi.fn<(options: unknown) => void>(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
    const location = { pathname: '/extensions' };
    return options?.select === undefined ? location : options.select(location);
  },
  useNavigate: () => mocks.navigate,
}));

vi.mock('@app/extensions', async (importOriginal) => {
  const actual = await importOriginal<typeof ExtensionsModule>();
  return {
    ...actual,
    fetchExtensionsPage: mocks.fetchExtensionsPage,
    setProviderEnabled: mocks.setProviderEnabled,
  };
});

vi.mock('../../lib/local-db.js', () => ({
  flushLocalDb: () => Promise.resolve(),
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({}),
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => vi.fn<() => void>(),
}));

import { Route } from '../../routes/extensions.js';

const ExtensionsRoute = Route.options.component;

if (ExtensionsRoute === undefined) {
  throw new Error('The /extensions route must expose its component.');
}

const page: ExtensionsPageData = {
  providers: [
    {
      id: 'prov-a',
      name: 'Provider A',
      version: '1.0.0',
      enabled: true,
      health: 'ok',
      sourceUrl: 'https://example.test/extension.js',
      languages: ['en'],
      capabilityCount: 1,
    },
  ],
};

describe('/extensions route provider list invalidation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchExtensionsPage.mockResolvedValue(page);
    mocks.setProviderEnabled.mockResolvedValue({ ok: true, value: undefined });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ExtensionsRoute />
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

  it('Given a provider is disabled, Then the search provider fan-out list is invalidated', async () => {
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll('button')].map((button) => button.textContent),
      ).toContain('Disable'),
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Disable')
        ?.click();
    });

    await vi.waitFor(() =>
      expect(mocks.setProviderEnabled).toHaveBeenCalledWith(expect.anything(), 'prov-a', false),
    );
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: searchQueryKeys.providers() }),
    );
  });
});
