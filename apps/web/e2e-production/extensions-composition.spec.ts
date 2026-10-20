import { expect, type Page } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

// The route renders the list only on the index path and the child detail
// elsewhere; these helpers read the composition, not the tests' own state.
const detailsButton = (page: Page) => page.getByRole('button', { name: 'Details', exact: true });
const providerDetails = (page: Page) => page.getByRole('region', { name: 'Provider details' });

test('Given the extensions list, When Details opens and history moves, Then each route renders its own composition', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/extensions');
  await expect(page.getByRole('region', { name: 'Extensions' })).toBeVisible({ timeout: 20_000 });
  await expect(detailsButton(page)).toHaveCount(1);
  await expect(providerDetails(page)).toHaveCount(0);

  await detailsButton(page).click();
  // The route's search schema serializes install=false, so match the pathname.
  await expect(page).toHaveURL((url) => url.pathname === '/extensions/mangadex', {
    timeout: 20_000,
  });
  await expect(providerDetails(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(detailsButton(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'MangaDex', exact: true })).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/extensions', { timeout: 20_000 });
  await expect(detailsButton(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(providerDetails(page)).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL((url) => url.pathname === '/extensions/mangadex', {
    timeout: 20_000,
  });
  await expect(providerDetails(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(detailsButton(page)).toHaveCount(0);
});

test('Given ?install=1, When the extensions route renders, Then the list stays and the install dialog opens', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/extensions?install=1');
  // The open modal marks the page aria-hidden, so role locators see nothing
  // outside the dialog: locate the list itself to prove it still rendered.
  const list = page.locator('section[aria-label="Extensions"]');
  await expect(list).toBeVisible({ timeout: 20_000 });
  await expect(list.getByText('MangaDex', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Install provider' })).toBeVisible({
    timeout: 20_000,
  });
});
