import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Every jsdom file boots its own worker; without a cap the small suite still
    // starts one process per file and thrashes a 2-core CI runner. A 100ms
    // component test then misses the 5s timeout. Cap workers instead of raising it.
    maxWorkers: 4,
  },
});
