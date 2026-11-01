import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Every jsdom file boots its own worker, so the default worker count (one per
    // CPU here = 10) turns three concurrent suite copies into ~30 processes all
    // compiling and running jsdom at once. Individual component tests then take
    // several seconds of wall clock and blow the 5s test timeout even though the
    // test body itself is milliseconds. Cap the per-process worker count instead of
    // raising test timeouts, so a genuine hang still fails fast.
    maxWorkers: 4,
  },
});
