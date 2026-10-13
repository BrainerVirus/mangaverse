import { expect, test } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, finishOnboardingQuick, mockMangaDexApi } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

test('Given an open chapter, When switching to Scroll, Then the strip renders and scrolling drives the page', async ({ page }) => {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });

  // Switch to the continuous strip from the settings sheet.
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  const vertical = dialog.getByRole('button', { name: 'Vertical scroll' });
  await vertical.click();
  await expect(vertical).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  const strip = page.getByTestId('reader-scroll-view');
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await expect(strip.locator('[data-page-index]')).toHaveCount(37);

  // Scrolling to the top of page 11 puts the viewport center inside it.
  await strip.evaluate((element) => {
    const target = element.querySelector('[data-page-index="10"]');
    if (target instanceof HTMLElement) {
      element.scrollTop = target.offsetTop;
    }
  });
  await expect(page.getByText('11 / 37')).toBeVisible({ timeout: 10_000 });

  // Keyboard next moves the strip one page further.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('12 / 37')).toBeVisible({ timeout: 10_000 });

  // Switching back to Single keeps the current page in the page layout.
  await page.getByRole('button', { name: 'Settings' }).click();
  const single = page.getByRole('dialog', { name: 'Reader settings' }).getByRole('button', { name: 'Single page' });
  await single.click();
  await expect(single).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByText('12 / 37')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('reader-surface').locator('img')).toHaveCount(1, { timeout: 20_000 });
});
