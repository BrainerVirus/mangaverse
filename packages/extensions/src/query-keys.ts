export const extensionsQueryKeys = {
  all: ['extensions'] as const,
  page: () => [...extensionsQueryKeys.all, 'page'] as const,
  ui: () => [...extensionsQueryKeys.all, 'ui'] as const,
  detail: (providerId: string) => [...extensionsQueryKeys.all, 'detail', providerId] as const,
  activity: (providerId: string) => [...extensionsQueryKeys.all, 'activity', providerId] as const,
};
