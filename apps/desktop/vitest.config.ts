import { defineConfig } from 'vitest/config';

export default defineConfig({
  // src/renderer/ is covered by tsconfig.renderer.json, but Vite resolves the
  // nearest tsconfig.json, which sets `jsx: preserve`. Without this the JSX
  // reaches the SSR transform unparsed.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.mjs'],
    // App import pulls the web router graph; CI runners can exceed the default 5s.
    testTimeout: 15_000,
  },
});
