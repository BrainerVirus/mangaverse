export const diagnosticsQueryKeys = {
  all: ['diagnostics'] as const,
  report: () => [...diagnosticsQueryKeys.all, 'report'] as const,
  events: () => [...diagnosticsQueryKeys.all, 'events'] as const,
} as const;
