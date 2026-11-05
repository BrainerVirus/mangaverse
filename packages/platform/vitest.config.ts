import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Concurrent runs race on node_modules/.vitest-cache cleanup (ENOTEMPTY, #261).
    fsModuleCache: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
