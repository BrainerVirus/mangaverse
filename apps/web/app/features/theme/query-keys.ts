export const themeQueryKeys = {
  all: ['theme'] as const,
  settings: () => [...themeQueryKeys.all, 'settings'] as const,
  definitions: () => [...themeQueryKeys.all, 'definitions'] as const,
} as const;
