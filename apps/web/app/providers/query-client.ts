import { MutationCache, QueryCache, QueryClient, type Mutation } from '@tanstack/react-query';

import { feedback } from '../lib/app-feedback.js';

function mutationSource(mutation: Mutation<unknown, unknown, unknown, unknown>): string {
  const key = mutation.options.mutationKey?.[0];
  return typeof key === 'string' ? `mutation ${key}` : 'mutation';
}

/**
 * The app's one query cache. `QueryProvider` hands it to React; route loaders warm it
 * directly, so a page that is about to open finds its data already there.
 */
export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const head = query.queryKey[0];
      feedback.onFailure(error, {
        source: typeof head === 'string' ? `query ${head}` : 'query',
        feedback: query.meta?.feedback,
        hasCachedData: query.state.data !== undefined,
      });
    },
  }),
  mutationCache: new MutationCache({
    onMutate: (_variables, mutation) => {
      if (mutation.meta?.feedback?.saving === true) feedback.onSaveStart(mutation.mutationId);
    },
    onSuccess: (_data, _variables, _result, mutation) => {
      if (mutation.meta?.feedback?.saving === true) {
        feedback.onSaveEnd(mutation.mutationId, 'saved');
      }
      const success = mutation.meta?.feedback?.success;
      if (success !== undefined) feedback.onSuccess(success);
    },
    onError: (error, variables, _result, mutation) => {
      if (mutation.meta?.feedback?.saving === true) {
        feedback.onSaveEnd(mutation.mutationId, 'failed');
      }
      feedback.onFailure(error, {
        source: mutationSource(mutation),
        feedback: mutation.meta?.feedback,
        onRetry: () => {
          // Rebuilt from its own options, so the retry repeats the optimistic
          // update and reports through this same middleware.
          void queryClient
            .getMutationCache()
            .build(queryClient, mutation.options)
            .execute(variables)
            .catch(() => undefined);
        },
      });
    },
  }),
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
