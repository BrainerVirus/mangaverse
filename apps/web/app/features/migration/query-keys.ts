export const migrationQueryKeys = {
  all: ['migration'] as const,
  providers: () => [...migrationQueryKeys.all, 'providers'] as const,
  candidates: (sourceProviderId: string) =>
    [...migrationQueryKeys.all, 'candidates', sourceProviderId] as const,
  targetSearch: (targetProviderId: string, query: string) =>
    [...migrationQueryKeys.all, 'target-search', targetProviderId, query] as const,
  history: () => [...migrationQueryKeys.all, 'history'] as const,
};
