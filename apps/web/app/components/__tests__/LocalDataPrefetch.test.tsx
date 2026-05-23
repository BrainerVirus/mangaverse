import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalDataPrefetch } from '../LocalDataPrefetch.js';

const { prefetchCoreLocalData } = vi.hoisted(() => ({
  prefetchCoreLocalData: vi.fn().mockResolvedValue(undefined),
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
  });

  it('prefetches core local data when the database is ready', async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <LocalDataPrefetch />
        </QueryClientProvider>,
      );
    });

    expect(prefetchCoreLocalData).toHaveBeenCalledTimes(1);
    expect(prefetchCoreLocalData).toHaveBeenCalledWith(queryClient, { id: 'mock-db' });
  });
});
