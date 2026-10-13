import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 90_000 });

// GSAP stagger reveals hide grid items via autoAlpha until the animation runs;
// reduced motion sets them visible immediately, keeping these flow tests
// deterministic on slow CI runners without changing what is exercised.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const fixturesDir = fileURLToPath(
  new URL('../../../packages/extensions-mangadex/src/fixtures/', import.meta.url),
);

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}/${name}`, 'utf8');
}

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

interface ApiCalls {
  count: number;
}

async function mockMangaDexApi(page: Page, calls?: ApiCalls) {
  await page.route('**/api.mangadex.org/**', async (route) => {
    if (calls) calls.count += 1;
    const url = route.request().url();
    let body: string;
    if (url.includes('/at-home/server/')) {
      body = fixture('at-home.json');
    } else if (/\/manga\/[^/?]+\/feed/.test(url)) {
      body = fixture('feed.json');
    } else if (/\/manga\/[^/?]+(\?|$)/.test(url)) {
      body = fixture('detail.json');
    } else {
      body = fixture('search.json');
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body,
    });
  });
  await page.route('**/uploads.mangadex.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
  // Page images come from the at-home CDN host, not the API host.
  await page.route('**/*.mangadex.network/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
}

async function clickContinue(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

async function finishOnboardingQuick(page: Page) {
  await page.goto('/onboarding');
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
}

test('Given a fresh production install, When opening Extensions, Then MangaDex is installed and enabled', async ({ page }) => {
  await finishOnboardingQuick(page);
  await page.goto('/extensions');
  await expect(page.getByText('MangaDex').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Enabled').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable' })).toBeVisible();
});

test('Given the search page, When a query runs through the provider, Then results render with cached covers', async ({ page }) => {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  await page.goto('/search');
  await page.getByRole('searchbox', { name: 'Search manga' }).fill('berserk');
  await expect(page.getByRole('button', { name: 'Kuro no Shoukanshi' })).toBeVisible({ timeout: 20_000 });
  const image = page.getByTestId('search-results-grid').locator('img').first();
  await expect(image).toBeVisible();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0))
    .toBe(true);
});

test('Given a provider-backed manga id, When the detail opens, Then chapters come from the feed', async ({ page }) => {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  // Direct navigation keeps this test about the provider detail path; the
  // search-result click is covered by the search test above.
  await page.goto('/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031');
  await expect(page.getByRole('heading', { name: 'Kuro no Shoukanshi' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Ch\. 1 - The Summoner/ })).toBeVisible({ timeout: 30_000 });
});

test('Given a provider-backed chapter id, When the reader opens, Then decoded pages render from the local cache', async ({ page }) => {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  await page.goto('/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031');
  const chapter = page.getByRole('button', { name: /Ch\. 1 - The Summoner/ });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/);
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), { timeout: 20_000 })
    .toBe(true);
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 20_000 });
});

test('Given an enabled provider, When Discover opens, Then capability sections render with covers', async ({ page }) => {
  await finishOnboardingQuick(page);
  await mockMangaDexApi(page);
  await page.goto('/discover');
  await expect(page.getByTestId('discover-section-latest')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('discover-section-popular')).toBeVisible();
  const popular = page.getByTestId('discover-section-popular');
  await expect(popular.getByRole('button', { name: 'Kuro no Shoukanshi' })).toBeVisible();
  const image = popular.locator('img').first();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth > 0), { timeout: 20_000 })
    .toBe(true);
});

test('Given a disabled provider, When searching, Then no provider request is made', async ({ page }) => {
  await finishOnboardingQuick(page);
  const calls: ApiCalls = { count: 0 };
  await mockMangaDexApi(page, calls);
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
  expect(calls.count).toBe(0);
});
