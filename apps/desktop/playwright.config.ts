import { defineConfig } from '@playwright/test';

// Drives the built app (`pnpm --filter @app/desktop build` first): dist/main + dist/renderer.
export default defineConfig({
  testDir: './e2e',
  // Inside the ignored dist/ so traces never show up as untracked files.
  outputDir: './dist/e2e-results',
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 90_000,
  use: { trace: 'retain-on-failure' },
});
