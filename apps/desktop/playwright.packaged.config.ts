import { defineConfig } from '@playwright/test';

/** Proof against a packaged artifact. Run `pnpm --filter @app/desktop package:mac` first. */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/packed-app.spec.ts'],
  outputDir: './dist/e2e-results',
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 120_000,
  use: { trace: 'retain-on-failure' },
});
