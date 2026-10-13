import { expect, test, type Page } from '@playwright/test';

import {
  MANGADEX_APP_MANGA_ID,
  finishOnboardingQuick,
  mockMangaDexApi,
  waitForPingQuiet,
} from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

async function openReader(page: Page) {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/, { timeout: 30_000 });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

test('Given an open chapter, When navigating by keyboard and buttons, Then pages change once each time', async ({ page }) => {
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

test('Given the reader advanced a page, When the page reloads, Then it resumes on the saved page', async ({ page }) => {
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

test('Given the reader advanced a page, When leaving client-side immediately, Then the pending page is checkpointed', async ({ page }) => {
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
