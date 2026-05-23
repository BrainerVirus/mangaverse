export const diagnosticsQueryKeys = {
  all: ['diagnostics'] as const,
  report: () => [...diagnosticsQueryKeys.all, 'report'] as const,
} as const;
