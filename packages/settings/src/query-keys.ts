export const settingsQueryKeys = {
  all: ['settings'] as const,
  app: () => [...settingsQueryKeys.all, 'app'] as const,
} as const;
