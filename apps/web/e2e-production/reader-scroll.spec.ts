import { expect, type Locator, type Page } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const PAGE_COUNT = 37;

/** The chrome's page badge, e.g. `11 / 37`. */
const pageCounter = (page: Page) => page.getByText(new RegExp(`^\\d+ / ${PAGE_COUNT}$`));

/**
 * Requires the badge to hold `expected` across a quiet window. A scroll can
 * land on a stale metric read and be corrected a frame later, so one visible
 * match is not proof of the settled page.
 */
async function expectPageSettled(page: Page, expected: string, timeout = 5_000) {
  await expect(async () => {
    await expect(pageCounter(page)).toHaveText(expected, { timeout: 2_000 });
    await page.waitForTimeout(500);
    await expect(pageCounter(page)).toHaveText(expected, { timeout: 2_000 });
  }).toPass({ timeout });
}

/**
 * Scrolls the strip to `index` and waits until the chrome reports that page as
 * settled. Rows start at their 2:3 placeholder until their image decodes, and
 * every decode above the target moves its offset, so the jump is re-applied
 * from the live offsets until the strip maps the scroll position to the page.
 */
async function scrollStripToPage(page: Page, strip: Locator, index: number) {
  await expect(async () => {
    await strip.evaluate((element, target) => {
      const row = element.querySelector<HTMLElement>(`[data-page-index="${target}"]`);
      if (row !== null) {
        element.scrollTop = row.offsetTop;
      }
    }, index);
    await expect(pageCounter(page)).toHaveText(`${index + 1} / ${PAGE_COUNT}`, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await expectPageSettled(page, `${index + 1} / ${PAGE_COUNT}`);
}

test('Given an open chapter, When switching to Scroll, Then the strip renders and scrolling drives the page', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // Reduced motion makes every page change an instant jump, so the assertions
  // read the settled page instead of a smooth-scroll frame in progress.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(pageCounter(page)).toHaveText(`1 / ${PAGE_COUNT}`, { timeout: 30_000 });

  // Switch to the continuous strip from the settings sheet.
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  const vertical = dialog.getByRole('button', { name: 'Vertical scroll' });
  await vertical.click();
  await expect(vertical).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const strip = page.getByTestId('reader-scroll-view');
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await expect(strip.locator('[data-page-index]')).toHaveCount(PAGE_COUNT);

  // Scrolling to the top of page 11 puts the viewport center inside it.
  await scrollStripToPage(page, strip, 10);

  // Keyboard next moves the strip one page further.
  await page.keyboard.press('ArrowRight');
  await expectPageSettled(page, `12 / ${PAGE_COUNT}`, 10_000);

  // Switching back to Single keeps the current page in the page layout.
  await page.getByRole('button', { name: 'Settings' }).click();
  const single = page
    .getByRole('dialog', { name: 'Reader settings' })
    .getByRole('button', { name: 'Single page' });
  await single.click();
  await expect(single).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toBeHidden();
  await expectPageSettled(page, `12 / ${PAGE_COUNT}`, 20_000);
  await expect(page.getByTestId('reader-surface').locator('img')).toHaveCount(1, {
    timeout: 20_000,
  });
});
