import { defineConfig } from 'vitest/config';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    environment: 'jsdom',
    include: [
      'app/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.tsx',
      'app/providers/**/*.test.tsx',
    ],
    globals: true,
  },
});
