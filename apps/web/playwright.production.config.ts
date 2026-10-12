import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5185';

export default defineConfig({
  testDir: './e2e-production',
  forbidOnly: !!process.env.CI,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && pnpm start',
    env: { PORT: '5185' },
    url: `${baseURL}/favicon.svg`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
