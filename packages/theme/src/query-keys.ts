export const themeQueryKeys = {
  all: ['theme'] as const,
  settings: () => [...themeQueryKeys.all, 'settings'] as const,
} as const;
