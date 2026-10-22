import { expect } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, openCommandPalette, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const TITLE = 'Kuro no Shoukanshi';
const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Given a recently read title, When the palette opens, Then it appears under Recent and continues reading', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await expect(page).toHaveURL(/\/library/);

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();

  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/, { timeout: 30_000 });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  await waitForPingQuiet(page);

  await page.goto('/library');
  const palette = await openCommandPalette(page);
  await expect(palette.getByText(`Continue reading ${TITLE}`)).toBeVisible({ timeout: 20_000 });
  await expect(palette.getByText(`Open ${TITLE}`)).toBeVisible();

  await page.getByLabel('Search commands').fill('kuro');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/, { timeout: 20_000 });
  await expect(palette).toBeHidden();
});

test('Given the palette is open, When a settings shortcut runs, Then the settings page opens', async ({
  page,
  quickOnboarding,
}) => {
  await expect(page).toHaveURL(/\/library/);

  await openCommandPalette(page);

  await page.getByLabel('Search commands').fill('reader settings');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/settings\/reader/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Reader settings' })).toBeVisible();
});
