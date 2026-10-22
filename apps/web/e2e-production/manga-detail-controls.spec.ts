import { expect } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const MANGA_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const width of [390, 1440]) {
  test(`Given a detail page at ${width}px, Then provider, chapter, cover and shortcut controls work`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(MANGA_PATH);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
    expect(mockMangaDex.count).toBeGreaterThan(0);

    // Providers: one attached mapping is both the default and the current view.
    const providers = page.getByRole('region', { name: 'Providers' });
    await expect(providers.getByText('MangaDex', { exact: true })).toBeVisible();
    await expect(providers.getByText('Default', { exact: true })).toBeVisible();
    await expect(providers.getByText('Viewing', { exact: true })).toBeVisible();
    await expect(providers.getByText(MANGADEX_APP_MANGA_ID.replace('dev-md-', ''))).toBeVisible();

    // Read state: mark the chapter read, then unread, and survive a reload.
    const markRead = page.getByRole('button', { name: /^Mark read:/ }).first();
    await markRead.click();
    await expect(page.getByTestId('chapter-summary')).toHaveText('All chapters read.');
    await expect(page.getByRole('button', { name: /^Mark unread:/ }).first()).toBeVisible();
    await waitForPingQuiet(page);

    await page.reload();
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Mark unread:/ }).first()).toBeVisible();
    await page
      .getByRole('button', { name: /^Mark unread:/ })
      .first()
      .click();
    await expect(page.getByTestId('chapter-summary')).toContainText('1 unread');
    await waitForPingQuiet(page);

    // Custom cover: set a real URL through the dialog, then reset it.
    await page.getByRole('button', { name: 'Custom cover' }).click();
    const coverDialog = page.getByRole('dialog');
    await expect(coverDialog).toBeVisible();
    await coverDialog.getByLabel('Cover image URL').fill('not-a-url');
    await coverDialog.getByRole('button', { name: 'Save cover' }).click();
    await expect(coverDialog.getByRole('alert')).toHaveText('Enter a valid cover image URL.');
    await coverDialog
      .getByLabel('Cover image URL')
      .fill('https://uploads.mangadex.org/covers/custom.jpg');
    await coverDialog.getByRole('button', { name: 'Save cover' }).click();
    await expect(page.getByRole('button', { name: 'Change cover' })).toBeVisible();
    await waitForPingQuiet(page);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Change cover' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Change cover' }).click();
    await page.getByRole('button', { name: 'Reset to provider cover' }).click();
    await expect(page.getByRole('button', { name: 'Custom cover' })).toBeVisible();

    // Shortcuts carry the context the destination pages need.
    await page.getByRole('button', { name: 'Migrate' }).click();
    await expect(page).toHaveURL(/\/migration\?source=mangadex/);
    await expect(page.getByLabel('Source provider')).toContainText(/MangaDex/i);

    await page.goto(MANGA_PATH);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Provider settings' }).click();
    await expect(page).toHaveURL(/\/extensions\/mangadex/);

    await page.goto(MANGA_PATH);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Reader settings' }).click();
    await expect(page).toHaveURL(new RegExp(`/settings/reader\\?title=${MANGADEX_APP_MANGA_ID}`));
    await expect(page.getByRole('button', { name: 'Reset title settings' })).toBeVisible();

    // The layout stays inside the viewport at both widths.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
