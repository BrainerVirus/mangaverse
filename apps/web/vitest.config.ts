import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // vitest does not apply resolve.tsconfigPaths; mirror the tsconfig `@/*` mapping.
    alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'jsdom',
    include: [
      'app/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.tsx',
      'app/__tests__/**/*.test.ts',
      'app/__tests__/**/*.test.tsx',
      'app/providers/**/*.test.tsx',
      'app/features/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./test-setup.ts'],
    globals: true,
    // Every one of the ~72 jsdom files boots its own worker and jsdom environment.
    // At the default worker count (one per CPU here = 10) three concurrent suite
    // copies spawn ~30 processes, and ordinary async tests then miss the 5s test
    // timeout because the machine — not the test — is the bottleneck. Cap the
    // per-process worker count instead of raising test timeouts, so a genuine hang
    // still fails fast. (`pool: 'threads'` is not an option here: jsdom in threads
    // took this suite from ~15s to ~39s.)
    maxWorkers: 4,
  },
});
