export const storageQueryKeys = {
  all: ['storage'] as const,
  summary: () => [...storageQueryKeys.all, 'summary'] as const,
} as const;
