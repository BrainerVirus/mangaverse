import { expect, type Page } from '@playwright/test';

import { test, waitForPingQuiet } from './helpers.js';

const MANGA_PATH = '/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';
const TITLE = 'Kuro no Shoukanshi';

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function addToLibrary(page: Page): Promise<void> {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);
  await page.goto('/library');
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });
}

async function createCategory(page: Page, name: string, pin = true): Promise<void> {
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByLabel('New category').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  if (pin) {
    await page.getByRole('button', { name: `Pin ${name}` }).click();
    await expect(page.getByRole('button', { name: `Unpin ${name}` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 20_000 });
}

async function assignCategoryToTitle(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Select titles' }).click();
  await page.getByLabel(`Select ${TITLE}`).check();
  await page.getByRole('button', { name: 'Bulk categories' }).click();
  await page.getByLabel(name, { exact: true }).check();
  await page.getByRole('button', { name: 'Add to selected' }).click();
  await waitForPingQuiet(page);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('Given a library title, When a category is created, assigned, filtered, sorted and bulk-edited, Then it survives a reload', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addToLibrary(page);

  await createCategory(page, 'Fantasy');
  await assignCategoryToTitle(page, 'Fantasy');

  // Category filter narrows the library to the assigned title.
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);
  await expect(page.getByText('1 title')).toBeVisible();

  // Sort by title keeps the same result and is a real select interaction.
  await page.getByLabel('Sort library').click();
  await page.getByRole('option', { name: 'Title · A–Z' }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);

  // Bulk favorite and status changes on the selected title.
  await page.getByRole('button', { name: 'Favorites' }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Favorites' }).click();

  await page.getByLabel(`Select ${TITLE}`).check();
  await page.getByRole('button', { name: 'Favorite selected', exact: true }).click();
  await page.getByLabel('Set status for selected').click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite selected' })).toBeEnabled();
  await waitForPingQuiet(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });

  // Pinned category and filters survive with the stored data.
  await expect(page.getByRole('button', { name: 'Fantasy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);

  await page.getByLabel('Filter by status').click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-library-card]').first()).toBeVisible();

  // The title detail reads back the persisted favorite and category.
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('button', { name: 'Favorited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Fantasy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Given a phone viewport, When categories are organized, Then the toolbar wraps and pinning persists', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addToLibrary(page);
  await expectNoHorizontalOverflow(page);

  await createCategory(page, 'Mobile shelf', false);
  await expectNoHorizontalOverflow(page);

  // Pin through the manager on the narrow viewport.
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByRole('button', { name: 'Pin Mobile shelf' }).click();
  await expect(page.getByRole('button', { name: 'Unpin Mobile shelf' })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await assignCategoryToTitle(page, 'Mobile shelf');
  await page.getByRole('button', { name: 'Mobile shelf', exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);

  await waitForPingQuiet(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Mobile shelf', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
