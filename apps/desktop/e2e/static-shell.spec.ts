import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;

/** Every pid in the app's process tree: main, renderer, GPU, utility. */
function processTree(rootPid: number): number[] {
  const parents = new Map<number, number[]>();
  for (const line of execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).split(
    '\n',
  )) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid > 0) parents.set(ppid, [...(parents.get(ppid) ?? []), pid]);
  }
  const pids = [rootPid];
  for (let i = 0; i < pids.length; i += 1) pids.push(...(parents.get(pids[i]) ?? []));
  return pids;
}

/** TCP sockets in LISTEN state owned by any of the pids, as reported by lsof. */
function listeningSockets(pids: number[]): string {
  try {
    return execFileSync('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    // lsof exits 1 with no output when nothing matches.
    const { status, stdout } = error as { status?: number; stdout?: string };
    if (status === 1) return (stdout ?? '').trim();
    throw error;
  }
}

let app: ElectronApplication;
let page: Page;
let userDataDir: string;
const networkRequests: string[] = [];
const cspViolations: string[] = [];

test.skip(process.platform === 'win32', 'the port check relies on lsof');

test.beforeAll(async () => {
  if (!existsSync(join(desktopRoot, 'dist/renderer/index.html'))) {
    throw new Error('Build the desktop app first: pnpm --filter @app/desktop build');
  }
  userDataDir = mkdtempSync(join(tmpdir(), 'mangaverse-static-shell-'));
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  delete env.MANGAVERSE_RENDERER_URL;
  app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Take the machine offline for the app: every http(s)/ws request is recorded and cancelled.
  await app.evaluate(async ({ session }) => {
    const g = globalThis as { __networkRequests?: string[] };
    g.__networkRequests = [];
    session.defaultSession.enableNetworkEmulation({ offline: true });
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const isNetwork = /^(https?|wss?):/i.test(details.url);
      if (isNetwork) g.__networkRequests?.push(details.url);
      callback({ cancel: isNetwork });
    });
  });
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('the window starts on the app:// protocol', async () => {
  expect(page.url()).toMatch(/^app:\/\/app\//);
});

test('a fresh deep route boots offline from the protocol', async () => {
  // A fresh profile: the deep route boots, and the client router sends it to onboarding.
  const response = await page.goto('app://app/library');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL('app://app/onboarding');
  await expect(page.getByRole('heading', { name: 'Welcome to MangaVerse' })).toBeVisible();

  // Finish onboarding offline; the data it writes lives on the app:// origin.
  for (let step = 0; step < 4; step += 1) {
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(next).toBeEnabled({ timeout: 20_000 });
    await next.click();
  }
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL('app://app/library', { timeout: 20_000 });

  // Fresh document loads of deep routes stay put and render the shell.
  for (const route of ['/library', '/settings', '/search']) {
    const fresh = await page.goto(`app://app${route}`);
    expect(fresh?.status()).toBe(200);
    await expect(page.locator('[data-app-shell="true"]')).toBeVisible();
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe(route);
  }
  await page.reload();
  await expect(page).toHaveURL('app://app/search');

  // Client navigation works with no server: JS hydrated and the router runs from app://.
  await page.getByRole('link', { name: 'Library' }).first().click();
  await expect(page).toHaveURL('app://app/library');

  networkRequests.push(
    ...(await app.evaluate(
      () => (globalThis as { __networkRequests?: string[] }).__networkRequests ?? [],
    )),
  );
  const shellRequests = networkRequests.filter((url) => !/mangadex\.org/.test(url));
  expect(shellRequests).toEqual([]);
  expect(cspViolations).toEqual([]);
});

test('the protocol sends the strict CSP and refuses traversal', async () => {
  const result = await app.evaluate(async ({ net }) => {
    const shell = await net.fetch('app://app/library');
    const traversal = await net.fetch('app://app/%2e%2e%2fmain%2findex.js');
    const outside = await net.fetch('app://app/..%2f..%2fpackage.json');
    return {
      status: shell.status,
      type: shell.headers.get('content-type'),
      csp: shell.headers.get('content-security-policy'),
      traversal: traversal.status,
      outside: outside.status,
    };
  });
  expect(result.status).toBe(200);
  expect(result.type).toBe('text/html; charset=utf-8');
  expect(result.csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(result.csp).not.toContain("'unsafe-eval'");
  expect(result.traversal).toBeGreaterThanOrEqual(400);
  expect(result.outside).toBeGreaterThanOrEqual(400);

  // The renderer itself cannot read across the root either.
  const fromRenderer = await page.evaluate(async () => {
    const r = await fetch('/%2e%2e%2fmain%2findex.js');
    return r.status;
  });
  expect(fromRenderer).toBeGreaterThanOrEqual(400);
});

// Playwright's launcher adds its own --inspect and --remote-debugging-port listeners, so the
// port check spawns the built app plainly, the way a user starts it.
test('a plain production start opens no listening TCP port', async () => {
  const plainUserData = mkdtempSync(join(tmpdir(), 'mangaverse-static-shell-plain-'));
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  delete env.MANGAVERSE_RENDERER_URL;
  const child = spawn(electronPath, [desktopRoot, `--user-data-dir=${plainUserData}`], {
    env,
    stdio: 'ignore',
  });
  try {
    const samples: string[] = [];
    let largestTree: number[] = [];
    // Sample across startup: the renderer, GPU and utility processes appear over a few seconds.
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const pids = processTree(child.pid!);
      if (pids.length > largestTree.length) largestTree = pids;
      samples.push(listeningSockets(pids));
    }
    test.info().annotations.push({ type: 'pids', description: largestTree.join(',') });
    // Main plus at least a renderer and the GPU process: the app really started.
    expect(largestTree.length).toBeGreaterThanOrEqual(3);
    expect(samples.filter((sample) => sample !== '')).toEqual([]);
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    rmSync(plainUserData, { recursive: true, force: true });
  }
});
