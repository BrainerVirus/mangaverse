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
    ],
    globals: true,
  },
});
