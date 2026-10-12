import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
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
