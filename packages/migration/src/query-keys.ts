export const migrationQueryKeys = {
  all: ['migration'] as const,
  providers: () => [...migrationQueryKeys.all, 'providers'] as const,
  candidates: (sourceProviderId: string) =>
    [...migrationQueryKeys.all, 'candidates', sourceProviderId] as const,
};
