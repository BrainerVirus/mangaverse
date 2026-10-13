import { expect, test } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, finishOnboardingQuick, mockMangaDexApi } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

async function openReader(page: import('@playwright/test').Page) {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: /Ch\. 1 - The Summoner/ });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

test('Given an open chapter, When tapping the page edges, Then the page advances and returns', async ({ page }) => {
  await openReader(page);
  const surface = page.getByTestId('reader-surface');
  const box = (await surface.boundingBox())!;

  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await expect(page.getByText('2 / 37')).toBeVisible();

  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.5);
  await expect(page.getByText('1 / 37')).toBeVisible();
});

test('Given an open chapter, When opening reader settings, Then reading controls change the layout', async ({ page }) => {
  await openReader(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Double page' }).click();
  await expect(page.getByTestId('reader-surface').locator('img')).toHaveCount(2, { timeout: 20_000 });

  await dialog.getByRole('button', { name: 'Single page' }).click();
  await expect(page.getByTestId('reader-surface').locator('img')).toHaveCount(1, { timeout: 20_000 });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Given an open chapter, When clicking Maximize, Then the document goes fullscreen', async ({ page }) => {
  await openReader(page);

  await page.getByRole('button', { name: 'Maximize' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
