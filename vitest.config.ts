import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Concurrent runs race on node_modules/.vitest-cache cleanup (ENOTEMPTY, #261).
    fsModuleCache: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['packages/**/src/**/*.d.ts'],
    },
  },
});
