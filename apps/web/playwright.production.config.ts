import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// Port policy: E2E_PORT wins; otherwise prefer 5185 and fall back to the first
// free port above it, so parallel slices never fight over one port (sibling
// port cleanup used to kill live runs). Playwright requires a single object
// export, so the probe runs synchronously in a short-lived node child.
// Bind the wildcard address, not 127.0.0.1: on macOS a listener holding *:PORT
// does not conflict with a loopback-only bind, so a loopback probe reports a
// taken port as free (verified with a sibling's *:5185 server).
const probeScript = (port: number): string =>
  `const net=require('net');const t=(a)=>new Promise((r)=>{const s=net.createServer();s.once('error',()=>r(false));s.listen(${port},a,()=>s.close(()=>r(true)));});(async()=>{process.exit((await t())&&(await t('127.0.0.1'))?0:1);})();`;

// A clean exit 1 from the probe means the port is taken (EADDRINUSE); anything
// else (timeout, spawn failure) must not move the port.
const isTaken = (port: number): boolean => {
  try {
    execFileSync(process.execPath, ['-e', probeScript(port)], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 5000,
    });
    return false;
  } catch (error) {
    return (error as { status?: number | null }).status === 1;
  }
};

const firstFreePort = (from: number): number => {
  for (let port = from; port < from + 50; port += 1) {
    if (!isTaken(port)) return port;
  }
  return from;
};

const resolvePort = (): number => {
  const requested = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 5185;
  // CI runs a single suite on a fresh runner: keep the requested port so a flaky
  // probe can never silently move the run to another port.
  if (process.env.CI !== undefined || !isTaken(requested)) return requested;
  return firstFreePort(requested + 1);
};

// Playwright re-evaluates this config in every worker process: without memoizing
// the resolution, the worker's probe would see the run's own server as taken and
// resolve requested+1 while the webServer stays on the requested port.
const memoized = process.env.E2E_RESOLVED_PORT;
const port = memoized === undefined ? resolvePort() : Number(memoized);
if (memoized === undefined) {
  process.env.E2E_RESOLVED_PORT = String(port);
}
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
