import { expect, test, type Page } from '@playwright/test';
import {
  devManifestFixture,
  mangadexCoverBaseUrl,
  mangadexExplicitFixture,
  mangadexListFixture,
  mangadexRecentFixture,
} from './fixtures/mangadex.js';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

async function mockMangaDexCovers(page: Page) {
  await page.route('**/uploads.mangadex.org/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: TINY_JPEG,
    });
  });
}

async function mockMangaDexApi(page: Page) {
  await page.route('**/api.mangadex.org/manga**', async (route) => {
    const url = route.request().url();
    const includesExplicit = url.includes('pornographic') || url.includes('erotica');
    const detailMatch = url.match(/\/manga\/([0-9a-f-]{36})(?:\?|$)/i);

    if (detailMatch !== null) {
      const mangaId = detailMatch[1]!;
      const entry =
        mangadexListFixture.data.find((item) => item.id === mangaId) ?? mangadexListFixture.data[0]!;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: entry,
          included: mangadexListFixture.included,
        }),
      });
      return;
    }

    const body = includesExplicit
      ? mangadexExplicitFixture
      : url.includes('order%5BcreatedAt%5D') || url.includes('order[createdAt]')
        ? mangadexRecentFixture
        : mangadexListFixture;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function mockDevManifest(page: Page) {
  await page.route('**/__dev/providers/mangadex/manifest.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(devManifestFixture),
    });
  });
}

async function clickContinue(page: Page) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 10_000 });
}

async function resetClientState(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function finishOnboardingQuick(page: Page) {
  await page.goto('/onboarding');
  if (!page.url().includes('/onboarding')) {
    return;
  }
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 20_000 });
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await clickContinue(page);
  await expect(page.getByRole('button', { name: 'Finish without provider' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish without provider' }).click();
  await expect(page).toHaveURL(/\/library/, { timeout: 20_000 });
}

async function prepareApp(page: Page) {
  await resetClientState(page);
  await mockMangaDexApi(page);
  await mockMangaDexCovers(page);
  await mockDevManifest(page);
  await finishOnboardingQuick(page);
}

async function navigateViaSidebar(page: Page, label: string) {
  await page.getByRole('link', { name: label, exact: true }).click();
}

async function expectCoverImagesVisible(page: Page, scope = page) {
  const images = scope.locator('img[src*="uploads.mangadex.org"]');
  await expect(images.first()).toBeVisible({ timeout: 20_000 });
  const count = await images.count();
  expect(count).toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const first = images.first();
      return first.evaluate((img: HTMLImageElement) => img.naturalWidth > 0);
    })
    .toBe(true);
}

test.describe('catalog flows', () => {
  test.beforeEach(async ({ page }) => {
    await prepareApp(page);
  });

  test('discover renders sections, cover images, and provider tabs', async ({ page }) => {
    await navigateViaSidebar(page, 'Discover');
    await expect(page).toHaveURL(/\/discover/);
    await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('tab', { name: devManifestFixture.name })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId('discover-section-popular')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('discover-section-latest')).toBeVisible();
    await expect(page.getByTestId('discover-section-recent')).toBeVisible();

    const popular = page.getByTestId('discover-section-popular');
    await expect(popular.getByRole('button', { name: 'Berserk' })).toBeVisible();
    await expect(popular.getByRole('button', { name: 'Chainsaw Man' })).toBeVisible();
    await expectCoverImagesVisible(page, popular);
  });

  test('discover see all shows cards with cover images', async ({ page }) => {
    await navigateViaSidebar(page, 'Discover');
    await expect(page.getByTestId('discover-section-popular')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('region', { name: 'Popular' }).getByRole('button', { name: 'See all' }).click();
    await expect(page).toHaveURL(/section=popular/);
    await expect(page.getByTestId('discover-expanded-section')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('search-results-grid')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Berserk' })).toBeVisible();
    await expectCoverImagesVisible(page, page.getByTestId('discover-expanded-section'));
  });

  test('search renders manga cards for provider results', async ({ page }) => {
    await navigateViaSidebar(page, 'Search');
    await expect(page).toHaveURL(/\/search/);
    await page.getByRole('searchbox', { name: 'Search manga' }).fill('berserk');
    await expect(page.getByTestId('search-results-grid')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Berserk' })).toBeVisible();
    await expectCoverImagesVisible(page, page.getByTestId('search-results-grid'));
  });

  test('search opens manga detail from a result card', async ({ page }) => {
    await navigateViaSidebar(page, 'Search');
    await page.getByRole('searchbox', { name: 'Search manga' }).fill('berserk');
    await expect(page.getByRole('button', { name: 'Berserk' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Berserk' }).click();
    await expect(page).toHaveURL(/\/manga\//);
    await expect(page.getByRole('heading', { name: 'Berserk' })).toBeVisible();
    await expectCoverImagesVisible(page);
  });

  test('explicit content switch toggles aria state in app settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings/);
    await page.getByRole('button', { name: /^App\b/ }).click();
    await expect(page).toHaveURL(/\/settings\/app/);
    await expect(page.getByRole('heading', { name: 'App settings' })).toBeVisible({ timeout: 20_000 });
    const explicitSwitch = page.getByRole('switch', { name: 'Explicit content' });
    await expect(explicitSwitch).toHaveAttribute('aria-checked', 'false');
    await explicitSwitch.click();
    await expect(explicitSwitch).toHaveAttribute('aria-checked', 'true');
    await explicitSwitch.click();
    await expect(explicitSwitch).toHaveAttribute('aria-checked', 'false');
  });
});

test('onboarding install opens extensions install dialog in one click', async ({ page }) => {
  await resetClientState(page);
  await mockMangaDexApi(page);
  await mockDevManifest(page);
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Install a provider' }).click();
  await expect(page).toHaveURL(/\/extensions(\?install=true|\?install=1)/);
  await expect(page.getByRole('dialog', { name: 'Install provider' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Manifest URL')).not.toHaveValue('');
});

test('discover cover URLs use MangaDex CDN pattern', async ({ page }) => {
  await resetClientState(page);
  await mockMangaDexApi(page);
  await mockMangaDexCovers(page);
  await mockDevManifest(page);
  await finishOnboardingQuick(page);
  await navigateViaSidebar(page, 'Discover');
  const src = await page
    .getByTestId('discover-section-popular')
    .locator('img')
    .first()
    .getAttribute('src');
  expect(src).toContain(mangadexCoverBaseUrl);
});
