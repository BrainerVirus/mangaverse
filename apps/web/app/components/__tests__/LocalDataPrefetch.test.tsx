import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalDataPrefetch } from '../LocalDataPrefetch.js';

const { prefetchCoreLocalData } = vi.hoisted(() => ({
  prefetchCoreLocalData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('../../queries/prefetch-core-local-data.js', () => ({
  prefetchCoreLocalData,
}));

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'mock-db' }),
  useLocalDbStatus: () => 'ready' as const,
}));

describe('LocalDataPrefetch', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    prefetchCoreLocalData.mockClear();
    // jsdom has no idle scheduler; the fallback timer is the path under test.
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
    queryClient = new QueryClient();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('prefetches core local data when the database is ready, after the route settles', async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <LocalDataPrefetch />
          </QueryClientProvider>,
        );
      });

      expect(prefetchCoreLocalData).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(prefetchCoreLocalData).toHaveBeenCalledTimes(1);
      expect(prefetchCoreLocalData).toHaveBeenCalledWith(queryClient, { id: 'mock-db' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an idle prefetch when the shell unmounts first', async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <LocalDataPrefetch />
          </QueryClientProvider>,
        );
      });
      act(() => root.unmount());
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(prefetchCoreLocalData).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
