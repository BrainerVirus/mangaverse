import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// Port policy: E2E_PORT wins; otherwise prefer 5185 and fall back to the first
// free port above it, so parallel slices never fight over one port (sibling
// port cleanup used to kill live runs). Playwright requires a single object
// export, so the probe runs synchronously in a short-lived node child.
const probe = (script: string): string | null => {
  try {
    return execFileSync(process.execPath, ['-e', script], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const isFree = (port: number): boolean =>
  probe(
    `const s=require('net').createServer();s.once('error',()=>process.exit(1));s.listen(${port},'127.0.0.1',()=>s.close(()=>process.exit(0)));`,
  ) !== null;

const firstFreePort = (from: number): number => {
  for (let port = from; port < from + 50; port += 1) {
    if (isFree(port)) return port;
  }
  return from;
};

const requested = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 5185;
const port = isFree(requested) ? requested : firstFreePort(requested + 1);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e-production',
  forbidOnly: !!process.env.CI,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && pnpm start',
    env: { PORT: String(port) },
    url: `${baseURL}/favicon.svg`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
