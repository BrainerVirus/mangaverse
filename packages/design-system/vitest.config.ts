import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Concurrent runs race on node_modules/.vitest-cache cleanup (ENOTEMPTY, #261).
    fsModuleCache: false,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
});
