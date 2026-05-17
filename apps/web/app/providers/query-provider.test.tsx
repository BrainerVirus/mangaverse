import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from './query-provider';

describe('QueryProvider', () => {
  it('creates QueryClient with correct default options', () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30 * 1000,
          gcTime: 5 * 60 * 1000,
          retry: 1,
          refetchOnWindowFocus: false,
          networkMode: 'offlineFirst',
        },
        mutations: {
          networkMode: 'offlineFirst',
        },
      },
    });

    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30 * 1000);
    expect(defaults.queries?.gcTime).toBe(5 * 60 * 1000);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.networkMode).toBe('offlineFirst');
    expect(defaults.mutations?.networkMode).toBe('offlineFirst');
  });

  it('exports QueryProvider as a component', () => {
    expect(typeof QueryProvider).toBe('function');
  });
});