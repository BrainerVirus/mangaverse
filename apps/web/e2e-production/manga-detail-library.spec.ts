import { expect } from '@playwright/test';

import { test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const MANGA_PATH = '/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';
const TITLE = 'Kuro no Shoukanshi';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given a provider manga, When it is added, favorited and removed, Then every change survives a reload', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('In library')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();

  const favorite = page.getByRole('button', { name: 'Favorite', exact: true });
  await favorite.click();
  await expect(page.getByRole('button', { name: 'Favorited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await waitForPingQuiet(page);

  await page.goto('/library');
  await expect(page.getByRole('button', { name: new RegExp(TITLE) })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: new RegExp(TITLE) })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(MANGA_PATH);
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Favorited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Remove from library' }).click();
  await expect(page.getByRole('button', { name: 'Add to library' })).toBeVisible();
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Add to library' })).toBeVisible();
  await expect(page.getByText('In library')).toHaveCount(0);

  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible({
    timeout: 20_000,
  });
});
