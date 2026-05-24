import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.mjs'],
    // App import pulls the web router graph; CI runners can exceed the default 5s.
    testTimeout: 15_000,
  },
});
