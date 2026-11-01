export const backupQueryKeys = {
  all: ['backup'] as const,
  page: () => [...backupQueryKeys.all, 'page'] as const,
} as const;
