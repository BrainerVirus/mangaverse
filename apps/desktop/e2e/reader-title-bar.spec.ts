import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { showReaderControls } from './reader-controls.js';

// The reader starts below the desktop's app-drawn title bar (#387): its top controls never sit
// under the strip, and in fullscreen (no strip) they move up to the window edge. Measured on the
// real layout, because the offset is a CSS variable the title bar sets through `:has()`.

test.describe.configure({ timeout: 180_000 });

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const dbPackageRoot = join(desktopRoot, '../../packages/db');
const fixturesDir = join(desktopRoot, '../../packages/extensions/src/mangadex/fixtures');
const electronPath = createRequire(import.meta.url)('electron') as unknown as string;
const MANGADEX_MANGA_ID = 'dc332d04-d3b0-413c-a767-70f5e451b031';
const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
/** The room `READER_CHROME_INSETS.top` keeps for the chrome's top row above the page tap zones. */
const CHROME_TOP_INSET = 96;
/** Long enough to measure the stage while the chapter's pages are still on their way. */
const HYDRATION_DELAY_MS = 2_500;

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

const fixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf8');
/** Run in order and awaited: the app must have exited before its profile is removed. */
const cleanups: (() => Promise<void> | void)[] = [];

test.afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function startFixtureServer(): Promise<string> {
  const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
    if (path.startsWith('/covers/') || path.startsWith('/data')) {
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end(jpeg);
      return;
    }
    const send = (body: string) =>
      response.writeHead(200, { 'content-type': 'application/json' }).end(body);
    if (path.includes('/at-home/server/')) {
      setTimeout(() => send(fixture('at-home.json')), HYDRATION_DELAY_MS);
      return;
    }
    send(
      /\/manga\/[^/]+\/feed/.test(path)
        ? fixture('feed.json')
        : /\/manga\/[^/]+$/.test(path)
          ? fixture('detail.json')
          : fixture('search.json'),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.unshift(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no fixture port');
  return `http://127.0.0.1:${address.port}`;
}

async function seededProfile(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'mangaverse-title-bar-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const host = await import(pathToFileURL(join(dbPackageRoot, 'dist/host/index.js')).href);
  const db = await import(pathToFileURL(join(dbPackageRoot, 'dist/index.js')).href);
  const native = host.openNativeDatabase(join(directory, 'mangaverse.sqlite'));
  const now = new Date().toISOString();
  await db.upsertAppSetting(native.db, 'onboarding', {
    status: 'completed',
    currentStep: 'provider',
    completedSteps: ['welcome', 'theme', 'reading', 'preferences', 'provider'],
    startedAt: now,
    completedAt: now,
  });
  native.close();
  return directory;
}

async function launch(
  userDataDir: string,
  fixtureOrigin: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_SERVER_URL;
  env.MANGAVERSE_E2E_PROVIDER_FIXTURE = fixtureOrigin;
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [desktopRoot, `--user-data-dir=${userDataDir}`],
    env,
  });
  cleanups.unshift(() => app.close().catch(() => undefined));
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

async function box(page: Page, selector: string): Promise<Box> {
  const rect = await page.locator(selector).first().boundingBox();
  if (rect === null) throw new Error(`${selector} has no box`);
  return {
    top: rect.y,
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
  };
}

async function setFullScreen(app: ElectronApplication, fullScreen: boolean): Promise<void> {
  await app.evaluate(({ BrowserWindow }, next) => {
    BrowserWindow.getAllWindows()[0]?.setFullScreen(next);
  }, fullScreen);
}

test('the reader top controls start below the title bar, and at the window edge in fullscreen', async () => {
  const origin = await startFixtureServer();
  const { app, page } = await launch(await seededProfile(), origin);

  await page.goto('app://app/discover');
  await expect(page.getByText('Kuro no Shoukanshi').first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`app://app/manga/dev-md-${MANGADEX_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  const titleBar = await box(page, '[data-title-bar]');
  expect(titleBar.bottom).toBeGreaterThan(0);
  await chapter.click({ force: true });

  // Pages pending: the back pill carries the title in the stage's header, below the strip, and
  // the title stays inside the pill.
  await expect(page.getByTestId('reader-hydrating')).toBeVisible({ timeout: 30_000 });
  const header = '[data-testid="reader-stage-header"]';
  const pendingClose = await box(page, `${header} button`);
  const pendingTitle = await box(page, `${header} button span`);
  expect(pendingClose.top).toBeGreaterThanOrEqual(titleBar.bottom);
  expect(pendingTitle.left).toBeGreaterThanOrEqual(pendingClose.left);
  expect(pendingTitle.right).toBeLessThanOrEqual(pendingClose.right);
  const stage = await box(page, '[data-testid="reader-hydrating"]');
  expect(stage.top).toBe(titleBar.bottom);

  // Pages landed, chrome hidden: the round exit sits where the pending pill was.
  await expect(page.getByTestId('reader-surface').locator('img').first()).toBeVisible({
    timeout: 30_000,
  });
  const exit = page.getByRole('button', { name: 'Close reader', exact: true });
  const exitBox = await exit.boundingBox();
  expect(exitBox?.y).toBe(pendingClose.top);
  expect(exitBox?.x).toBe(pendingClose.left);

  // Chrome shown: it starts at the strip's bottom and stays inside the inset the page tap zones
  // leave it, so a tap on the chrome is never a page turn.
  await showReaderControls(page);
  const surface = await box(page, '[data-testid="reader-surface"]');
  expect(surface.top).toBe(titleBar.bottom);
  // The chrome slides in; measure where it settles.
  const topRow = () => box(page, '[data-reader-chrome-row="top"]');
  await expect.poll(async () => (await topRow()).top).toBe(titleBar.bottom);
  expect((await topRow()).bottom).toBeLessThanOrEqual(surface.top + CHROME_TOP_INSET);
  // The progress rail below that row reaches past the inset (as it always did on the web and in
  // fullscreen), but the chrome is a layer above the surface: every point of it hits the chrome,
  // so no tap there reaches a page zone.
  const toolbar = await box(page, '[role="toolbar"][aria-label="Reader controls"]');
  expect(toolbar.top).toBe(titleBar.bottom);
  const hits = await page.evaluate((chrome) => {
    const points: [number, number][] = [];
    for (const x of [0.05, 0.5, 0.95]) {
      for (const y of [0.1, 0.5, 0.9]) {
        points.push([window.innerWidth * x, chrome.top + (chrome.bottom - chrome.top) * y]);
      }
    }
    return points.map(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[role="toolbar"]') !== null,
    );
  }, toolbar);
  expect(hits.every(Boolean)).toBe(true);

  // One anchor: the chrome's back pill is exactly where the pending pill and the round exit were,
  // so toggling the chrome never moves it.
  const chromePill = page
    .getByRole('toolbar', { name: 'Reader controls' })
    .getByRole('button', { name: /, close reader$/i });
  await expect.poll(async () => (await chromePill.boundingBox())?.y).toBe(pendingClose.top);
  expect((await chromePill.boundingBox())?.x).toBe(pendingClose.left);
  expect((await chromePill.boundingBox())?.height).toBe(pendingClose.bottom - pendingClose.top);
  await page.keyboard.press('h');
  await expect(exit).toBeVisible();
  expect(await exit.boundingBox()).toMatchObject({ x: pendingClose.left, y: pendingClose.top });
  await showReaderControls(page);
  await expect.poll(async () => (await chromePill.boundingBox())?.y).toBe(pendingClose.top);

  // Fullscreen has no strip: the surface and the chrome take the window's top edge.
  await setFullScreen(app, true);
  await expect(page.locator('[data-title-bar]')).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await box(page, '[data-testid="reader-surface"]')).top).toBe(0);
  await showReaderControls(page);
  await expect.poll(async () => (await topRow()).top).toBe(0);

  await setFullScreen(app, false);
  await expect(page.locator('[data-title-bar]')).toHaveCount(1, { timeout: 15_000 });
  await expect
    .poll(async () => (await box(page, '[data-testid="reader-surface"]')).top)
    .toBe(titleBar.bottom);
});
