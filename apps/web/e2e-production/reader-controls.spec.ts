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

test('Given an open chapter, When hovering and dragging the rail, Then a page preview follows and the page changes', async ({ page }) => {
  await openReader(page);
  const rail = page.getByRole('slider', { name: 'Page slider' });
  const box = (await rail.boundingBox())!;

  // Hover: a preview popover with a rendered page image follows the pointer.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  const preview = page.getByTestId('reader-rail-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('img')).toBeVisible({ timeout: 20_000 });
  await expect(preview).toContainText('19');

  // Drag the thumb to the end: the page follows the pointer while dragging.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/3[0-9] \/ 37/)).toBeVisible({ timeout: 20_000 });

  // The rail fill is proportional to the page the drag landed on.
  const indicator = (await page.getByText(/\d+ \/ 37/).first().textContent()) ?? '';
  const pageNumber = Number(indicator.match(/(\d+) \/ 37/)?.[1] ?? '0');
  const transform = await page
    .getByTestId('reader-rail-fill')
    .evaluate((el) => el.style.transform);
  const scale = Number(transform.match(/scaleX\(([\d.]+)\)/)?.[1] ?? '-1');
  expect(Math.abs(scale - (pageNumber - 1) / 36)).toBeLessThan(0.02);
});

test('Given the mode switcher, When changing modes, Then the highlight morphs to the active option', async ({ page }) => {
  await openReader(page);

  const highlight = page.locator('[class*="rounded-full"][class*="bg-white"][class*="absolute"]').first();
  const single = page.getByRole('button', { name: 'Single' });
  const double = page.getByRole('button', { name: 'Double' });

  await expect(highlight).toBeVisible();
  const singleBox = (await single.boundingBox())!;
  const before = (await highlight.boundingBox())!;
  expect(Math.abs(before.x - singleBox.x)).toBeLessThan(4);

  await double.click();
  await expect(double).toHaveText('Double');
  // Wait for the tween to settle, then the highlight sits over Double.
  await page.waitForTimeout(600);
  const doubleBox = (await double.boundingBox())!;
  const after = (await highlight.boundingBox())!;
  expect(Math.abs(after.x - doubleBox.x)).toBeLessThan(4);
  expect(Math.abs(after.width - doubleBox.width)).toBeLessThan(4);
});

test('Given an open chapter, When clicking Maximize, Then the document goes fullscreen', async ({ page }) => {
  await openReader(page);

  await page.getByRole('button', { name: 'Maximize' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
