import { expect, test, type Page } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, finishOnboardingQuick, mockMangaDexApi } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

async function openReader(page: Page) {
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

test('Given an open chapter, When changing settings, Then the layout changes and the page does not', async ({ page }) => {
  await openReader(page);
  // Page 1 is the cover (treatFirstPageAsCover), so it renders alone in double
  // layout too; advance to page 2 where a real spread exists.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  await expect(dialog).toBeVisible();
  // Focus moves into the sheet on open.
  await expect(dialog.getByRole('button', { name: 'Left to right' })).toBeFocused();

  const images = page.getByTestId('reader-surface').locator('img');
  const doubleButton = dialog.getByRole('button', { name: 'Double page' });
  const singleButton = dialog.getByRole('button', { name: 'Single page' });

  // aria-pressed flips only after the write commits and the refetch returns the
  // new settings, so the count assertions below run against the settled layout
  // instead of a transient mid-transition frame.
  await doubleButton.click();
  await expect(doubleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(images).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText('2 / 37')).toBeVisible();

  await singleButton.click();
  await expect(singleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(images).toHaveCount(1, { timeout: 20_000 });
  // Using the settings controls must never leak into the tap zones and page.
  await expect(page.getByText('2 / 37')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Focus returns to the trigger.
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
});

test('Given an open chapter, When clicking Maximize, Then the document goes fullscreen', async ({ page }) => {
  await openReader(page);

  await page.getByRole('button', { name: 'Maximize' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
