import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'app/stores/__tests__/**/*.test.ts',
      'app/stores/__tests__/**/*.test.tsx',
      'app/components/__tests__/**/*.test.ts',
      'app/components/__tests__/**/*.test.tsx',
      'app/components/shell/__tests__/**/*.test.ts',
      'app/components/shell/__tests__/**/*.test.tsx',
    ],
    globals: true,
  },
});