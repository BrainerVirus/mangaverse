export const settingsQueryKeys = {
  all: ['settings'] as const,
  app: () => [...settingsQueryKeys.all, 'app'] as const,
  reader: () => [...settingsQueryKeys.all, 'reader'] as const,
} as const;
