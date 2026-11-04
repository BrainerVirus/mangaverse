import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // Concurrent runs race on node_modules/.vitest-cache cleanup (ENOTEMPTY, #261).
    fsModuleCache: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // jsdom files each boot a worker; cap them so a small CI runner does not
    // thrash and push 100ms component tests past the 5s timeout.
    maxWorkers: 4,
  },
});
