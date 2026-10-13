import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

import {
  MANGADEX_APP_MANGA_ID,
  fixturesDir,
  test,
  waitForPingQuiet,
} from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/, { timeout: 30_000 });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

test('Given an open chapter, When navigating by keyboard and buttons, Then pages change once each time', async ({ page, quickOnboarding, mockMangaDex }) => {
  await openReader(page);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / 37')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('1 / 37')).toBeVisible();

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByText('1 / 37')).toBeVisible();
});

test('Given the chapter pages cannot be fetched, When retrying after the network returns, Then the chapter loads', async ({ page, quickOnboarding, mockMangaDex }) => {
  // Registered after the shared mock so it wins for the at-home route only.
  let failing = true;
  await page.route('**/api.mangadex.org/at-home/**', async (route) => {
    if (failing) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: readFileSync(fixturesDir + '/at-home.json', 'utf8'),
    });
  });

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('Could not load chapter')).toBeVisible({ timeout: 30_000 });

  failing = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
});

test('Given a cached chapter, When the network is gone and the reader is reopened, Then cached pages render', async ({ page, quickOnboarding, mockMangaDex }) => {
  await openReader(page);
  await waitForPingQuiet(page);

  // Leave client-side, then cut every provider host before returning.
  await page.goBack();
  await page.context().setOffline(true);
  await page.route('**/api.mangadex.org/**', (route) => route.abort('failed'));
  await page.route('**/uploads.mangadex.org/**', (route) => route.abort('failed'));
  await page.route('**/*.mangadex.network/**', (route) => route.abort('failed'));

  await page.goForward();
  // Prove the environment, not just the assertions: the browser reports offline
  // and a provider-host fetch genuinely fails.
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(
    await page.evaluate(() =>
      fetch('https://api.mangadex.org/ping')
        .then(() => 'ok')
        .catch(() => 'failed'),
    ),
  ).toBe('failed');

  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), { timeout: 20_000 })
    .toBe(true);

  await page.context().setOffline(false);
});

test('Given the reader advanced a page, When the page reloads, Then it resumes on the saved page', async ({ page, quickOnboarding, mockMangaDex }) => {
  await openReader(page);
  await waitForPingQuiet(page);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  // A full quiet window covers the 750 ms progress debounce plus the 400 ms
  // flush, so the reload below reads a snapshot that already holds page 2.
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByText('2 / 37')).toBeVisible({ timeout: 30_000 });
});

test('Given the reader advanced a page, When leaving client-side immediately, Then the pending page is checkpointed', async ({ page, quickOnboarding, mockMangaDex }) => {
  await openReader(page);
  await waitForPingQuiet(page);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();
  // Client-side back leaves the reader through the router, so React runs the
  // unmount checkpoint before the debounce would have fired.
  await page.goBack();
  await waitForPingQuiet(page);

  await page.goForward();
  await expect(page.getByText('2 / 37')).toBeVisible({ timeout: 30_000 });
});
