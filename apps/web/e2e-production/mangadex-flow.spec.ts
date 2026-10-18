import { expect } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

// GSAP stagger reveals hide grid items via autoAlpha until the animation runs;
// reduced motion sets them visible immediately, keeping these flow tests
// deterministic on slow CI runners without changing what is exercised.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given a fresh production install, When opening Extensions, Then MangaDex is installed and enabled', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/extensions');
  await expect(page.getByText('MangaDex').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Enabled').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible();
});

test('Given the search page, When a query runs through the provider, Then results render with cached covers', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto('/search');
  const searchbox = page.getByRole('searchbox', { name: 'Search manga' });
  const resultCount = page.getByText(/\d+ results?/).first();
  await expect(searchbox).toBeVisible({ timeout: 30_000 });

  // Slow CI runners can hydrate the search route after the first fill, which
  // drops it (no query ever runs). Retry the type-and-settle cycle a bounded
  // number of times; the settled count also tells the final assertion apart
  // from "query never ran".
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await searchbox.fill('berserk');
    try {
      await expect(resultCount).toBeVisible({ timeout: 5_000 });
      break;
    } catch {
      await searchbox.fill('');
    }
  }

  const result = page.getByRole('button', { name: 'Kuro no Shoukanshi' });
  await expect(result).toBeVisible({ timeout: 30_000 });
  const image = page.getByTestId('search-results-grid').locator('img').first();
  await expect(image).toBeVisible();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0))
    .toBe(true);
});

test('Given a provider-backed manga id, When the detail opens, Then chapters come from the feed', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // Direct navigation keeps this test about the provider detail path; the
  // search-result click is covered by the search test above.
  await page.goto('/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031');
  await expect(page.getByRole('heading', { name: 'Kuro no Shoukanshi' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: /Ch\. 1 - The Summoner/ })).toBeVisible({
    timeout: 30_000,
  });
});

test('Given a provider-backed chapter id, When the reader opens, Then decoded pages render from the local cache', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto('/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031');
  const chapter = page.getByRole('button', { name: /Ch\. 1 - The Summoner/ });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/);
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), {
      timeout: 20_000,
    })
    .toBe(true);
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 20_000 });
});

test('Given an enabled provider, When Discover opens, Then capability sections render with covers', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto('/discover');
  await expect(page.getByTestId('discover-section-latest')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('discover-section-popular')).toBeVisible();
  const popular = page.getByTestId('discover-section-popular');
  await expect(popular.getByRole('button', { name: 'Kuro no Shoukanshi' })).toBeVisible();
  const image = popular.locator('img').first();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), {
      timeout: 20_000,
    })
    .toBe(true);
});

test('Given a disabled provider, When searching, Then no provider request is made', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto('/extensions');
  const disableButton = page.getByRole('button', { name: 'Disable' });
  await expect(disableButton).toBeVisible({ timeout: 20_000 });
  await disableButton.click();
  await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible();

  await page.goto('/search');
  await page.getByRole('searchbox', { name: 'Search manga' }).fill('berserk');
  // Settle on the empty state the search query reaches only after its work is
  // done. With a wrongly enabled provider the query yields results instead, so
  // this wait itself fails — '0 results' during loading was a false settle.
  await expect(page.getByRole('heading', { name: 'No results found' })).toBeVisible({
    timeout: 20_000,
  });
  // The provider request (when wrongly enabled) fires right after the local
  // search resolves; this bounded window makes the zero-call assertion real.
  await page.waitForTimeout(1_500);
  await expect(page.getByRole('button', { name: 'Kuro no Shoukanshi' })).toHaveCount(0);
  expect(mockMangaDex.count).toBe(0);
});
