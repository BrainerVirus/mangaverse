import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The desktop test imports `@app/web/app/router.js`, whose graph uses the web
  // app's `@/*` alias (apps/web/tsconfig.json) — mirror it here.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../web/app', import.meta.url)),
    },
  },
  // src/renderer/ is covered by tsconfig.renderer.json, but Vite resolves the
  // nearest tsconfig.json, which sets `jsx: preserve`. Without this the JSX
  // reaches the SSR transform unparsed.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    // Concurrent runs race on node_modules/.vitest-cache cleanup (ENOTEMPTY, #261).
    fsModuleCache: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.mjs'],
    // App import pulls the web router graph; CI runners can exceed the default 5s.
    testTimeout: 15_000,
  },
});
