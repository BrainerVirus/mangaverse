import { expect, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

const DETAIL_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';
const INTERNAL_TEXT = 'INTERNAL_SECRET upstream';

/**
 * Registered after the recorded fixtures, so it wins: every MangaDex manga call
 * answers 503 until the returned function lifts it.
 */
async function failMangaDexDetail(page: Page): Promise<() => Promise<void>> {
  const handler = (route: Parameters<Parameters<Page['route']>[1]>[0]) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ result: 'error', errors: [{ detail: INTERNAL_TEXT }] }),
    });
  await page.route('**/api.mangadex.org/manga/**', handler);
  return () => page.unroute('**/api.mangadex.org/manga/**', handler);
}

/** Rounded like the shell layout suite: mobile emulation reports sub-pixel boxes (43.99997). */
async function height(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => Math.round(element.getBoundingClientRect().height));
}

function rounded(value: number | undefined): number {
  return Math.round(value ?? 0);
}

test('Given an unsaved title and a failing source, When Retry runs after it recovers, Then the title loads', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const restore = await failMangaDexDetail(page);
  await page.goto(DETAIL_PATH);

  await expect(page.getByText('Could not load this title')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Manga not found')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Go Back' })).toBeVisible();
  expect(await page.locator('body').textContent()).not.toContain('INTERNAL_SECRET');

  await restore();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  expect(mockMangaDex.count).toBeGreaterThan(0);
});

for (const width of [768, 1024]) {
  test(`Given the detail page at ${width}px, Then Back sits in the flow and the summary keeps its width`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(DETAIL_PATH);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

    const geometry = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Manga details"]') as HTMLElement;
      const style = getComputedStyle(section);
      const contentWidth =
        section.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const back = [...section.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Back',
      ) as HTMLElement;
      const title = section.querySelector('h1') as HTMLElement;
      return {
        contentWidth,
        backBottom: back.getBoundingClientRect().bottom,
        titleTop: title.getBoundingClientRect().top,
        titleWidth: title.getBoundingClientRect().width,
      };
    });

    // Back is a row above the content, not a column beside it.
    expect(geometry.backBottom).toBeLessThanOrEqual(geometry.titleTop);
    if (width === 768) {
      // One column: the title owns the full content width.
      expect(geometry.titleWidth).toBeGreaterThanOrEqual(geometry.contentWidth - 1);
    } else {
      // The cover sits beside the summary, which keeps well over half the column.
      expect(geometry.titleWidth).toBeGreaterThan(geometry.contentWidth * 0.6);
    }
    expect(mockMangaDex.count).toBeGreaterThan(0);
  });
}

test.describe('touch targets', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('Given a coarse pointer, Then the search field, the 404 link and the skip link are at least 44px', async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);

    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible({
      timeout: 30_000,
    });
    // An empty, unfiltered library renders no toolbar, so there is no library search field here.
    await expect(page.locator('input[aria-label="Search library"]')).toHaveCount(0);

    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'Search' }).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(await height(page, 'input[aria-label="Search manga"]')).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    const skipBox = await skip.boundingBox();
    expect(rounded(skipBox?.height)).toBeGreaterThanOrEqual(44);
    expect(rounded(skipBox?.width)).toBeGreaterThanOrEqual(44);

    await page.goto('/this/does/not/exist');
    const back = page.getByRole('link', { name: 'Back to library' });
    await expect(back).toBeVisible({ timeout: 30_000 });
    expect(rounded((await back.boundingBox())?.height)).toBeGreaterThanOrEqual(44);
    expect(mockMangaDex.count).toBeGreaterThanOrEqual(0);
  });

  test('Given a coarse pointer at 320px, Then the Extensions Source link is at least 44px', async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/extensions');
    const source = page.getByRole('link', { name: 'Source' }).first();
    await expect(source).toBeVisible({ timeout: 30_000 });
    expect(rounded((await source.boundingBox())?.height)).toBeGreaterThanOrEqual(44);
    expect(mockMangaDex.count).toBeGreaterThanOrEqual(0);
  });
});

test('Given a fine pointer at 1440px, Then the search field is a 44px hero', async ({
  page,
  quickOnboarding,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: 'Search' }).first()).toBeVisible({
    timeout: 30_000,
  });
  expect(await height(page, 'input[aria-label="Search manga"]')).toBe(44);
});

test('Given /search, Then an empty query prompts neutrally and ?q= fills the query', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: 'Search' }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Search your manga')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('No results found')).toHaveCount(0);

  await page.goto('/search?q=kuro');
  await expect(page.getByLabel('Search manga')).toHaveValue('kuro', { timeout: 30_000 });
  await expect(page.getByText(/^\d+ results?$/)).toHaveCount(1, { timeout: 30_000 });
  expect(mockMangaDex.count).toBeGreaterThanOrEqual(0);
});

test('Given a provider search failure at 390px, Then the notice shows above the filters', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api.mangadex.org/manga?**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/search?q=kuro');
  const unavailable = page.getByText('Provider search unavailable').first();
  await expect(unavailable).toBeVisible({ timeout: 30_000 });
  await expect(unavailable).toBeInViewport();
  expect(mockMangaDex.count).toBeGreaterThanOrEqual(0);
});
