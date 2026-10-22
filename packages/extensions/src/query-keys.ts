export const extensionsQueryKeys = {
  all: ['extensions'] as const,
  page: () => [...extensionsQueryKeys.all, 'page'] as const,
  ui: () => [...extensionsQueryKeys.all, 'ui'] as const,
  detail: (providerId: string) => [...extensionsQueryKeys.all, 'detail', providerId] as const,
  /**
   * The level (or 'summary') narrows the key. Calling it with only the
   * provider id returns the base prefix, so invalidating refreshes every level.
   */
  activity: (
    providerId: string,
    level?: 'all' | 'info' | 'warn' | 'error' | 'summary',
  ): readonly unknown[] =>
    level === undefined
      ? [...extensionsQueryKeys.all, 'activity', providerId]
      : [...extensionsQueryKeys.all, 'activity', providerId, level],
};
