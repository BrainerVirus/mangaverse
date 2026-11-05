import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import {
  fixturesDir,
  MANGADEX_APP_MANGA_ID,
  TINY_JPEG,
  test,
  waitForPingQuiet,
} from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const MANGA_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';
const CHAPTER = /Ch\. 1 - The Summoner/;
const EMPTY_FEED = JSON.stringify({
  result: 'ok',
  response: 'collection',
  data: [],
  limit: 0,
  offset: 0,
  total: 0,
});

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}/${name}`, 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/**
 * Serves MangaDex from the recorded fixtures. `feed` and `blocked` are mutable
 * so one test can start with no chapters, lose the provider, then recover.
 */
async function installMangaDexControl(
  page: Page,
  control: { feed: 'empty' | 'full'; blocked: boolean },
) {
  await page.route('**/api.mangadex.org/**', async (route) => {
    if (control.blocked) {
      await route.abort('failed');
      return;
    }
    const url = route.request().url();
    let body: string;
    if (url.includes('/at-home/server/')) {
      body = fixture('at-home.json');
    } else if (/\/manga\/[^/?]+\/feed/.test(url)) {
      body = control.feed === 'empty' ? EMPTY_FEED : fixture('feed.json');
    } else if (/\/manga\/[^/?]+(\?|$)/.test(url)) {
      body = fixture('detail.json');
    } else {
      body = fixture('search.json');
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  await page.route('**/uploads.mangadex.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
  await page.route('**/*.mangadex.network/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
}

test('Given a cached title, When the provider is blocked, Then local chapters render with no chapter error', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: CHAPTER })).toBeVisible({ timeout: 30_000 });
  await waitForPingQuiet(page);

  // The app document still loads; only the provider host is unreachable.
  await page.route('**/api.mangadex.org/**', (route) => route.abort('failed'));
  const startedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: CHAPTER })).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - startedAt).toBeLessThan(20_000);
  await expect(page.getByText('Could not load chapters')).toHaveCount(0);

  expect(mockMangaDex.count).toBeGreaterThan(0);
});

test('Given a title added while the provider is blocked, When it recovers, Then the entry persisted and the queued refresh lands', async ({
  page,
  quickOnboarding,
}) => {
  const control: { feed: 'empty' | 'full'; blocked: boolean } = { feed: 'empty', blocked: false };
  await installMangaDexControl(page, control);

  // A local identity with an empty chapter list, so the queued refresh has
  // real metadata to bring in later.
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Add to library' })).toBeVisible({
    timeout: 30_000,
  });
  await waitForPingQuiet(page);

  control.blocked = true;
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);

  // Reload with the provider still down: the local entry and the persisted
  // queue both survive, and the page still renders from SQLite.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('In library')).toBeVisible();
  await expect(page.getByRole('button', { name: CHAPTER })).toHaveCount(0);

  // Recovery: the provider answers again and the online seam drains the queue.
  control.feed = 'full';
  control.blocked = false;
  await page.evaluate(() => globalThis.dispatchEvent(new Event('online')));

  await expect(page.getByRole('button', { name: CHAPTER })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('In library')).toBeVisible();
});

test('Given a chapter whose pages are cached, When it is opened again, Then no provider or page request is made', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  let pageRequests = 0;
  await page.route('**/*.mangadex.network/**', async (route) => {
    pageRequests += 1;
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });

  await page.goto(MANGA_PATH);
  const chapter = page.getByRole('button', { name: CHAPTER });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  // Controls start hidden (R8) and reduced motion hides the badge with them.
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 30_000 });
  const firstImage = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(async () => firstImage.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), {
      timeout: 20_000,
    })
    .toBe(true);
  await waitForPingQuiet(page);

  const readerUrl = page.url();
  const apiCallsAfterFirstOpen = mockMangaDex.count;
  const pageRequestsAfterFirstOpen = pageRequests;
  expect(apiCallsAfterFirstOpen).toBeGreaterThan(0);
  expect(pageRequestsAfterFirstOpen).toBeGreaterThan(0);

  // Leave the reader, reset the counters, then reopen the chapter directly so
  // the detail route cannot be the source of a provider call.
  await page.goto('/library');
  mockMangaDex.count = 0;
  pageRequests = 0;

  await page.goto(readerUrl);
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 30_000 });
  const cachedImage = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(async () => cachedImage.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), {
      timeout: 20_000,
    })
    .toBe(true);

  expect(mockMangaDex.count).toBe(0);
  expect(pageRequests).toBe(0);
});
