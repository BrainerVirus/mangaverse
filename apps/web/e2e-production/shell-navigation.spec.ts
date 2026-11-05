import { expect } from '@playwright/test';

import { openCommandPalette, test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const ADVANCED_ENTRIES = [
  { name: 'Advanced', url: /\/advanced$/ },
  { name: 'Theme editor', url: /\/advanced\/theme$/ },
  { name: 'Diagnostics', url: /\/advanced\/diagnostics$/ },
  { name: 'Migration', url: /\/advanced\/migration$/ },
] as const;

test('Given the sidebar, When Settings is chosen, Then the settings page opens', async ({
  page,
  quickOnboarding,
}) => {
  await page.locator('aside').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/, { timeout: 20_000 });
});

test('Given the sidebar, Then it lists Browse and Manage and none of the Settings hub tools', async ({
  page,
  quickOnboarding,
}) => {
  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('list', { name: 'Browse' })).toBeVisible();
  await expect(sidebar.getByRole('list', { name: 'Manage' })).toBeVisible();
  const hubTools = ['Backup', 'Onboarding', ...ADVANCED_ENTRIES.map((entry) => entry.name)];
  await Promise.all(
    hubTools.map((name) => expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(0)),
  );
});

test.describe('mobile More menu', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  for (const { name, url } of [
    { name: 'Extensions', url: /\/extensions(\?|$)/ },
    { name: 'Backup', url: /\/backup$/ },
    { name: 'Onboarding', url: /\/onboarding$/ },
    ...ADVANCED_ENTRIES,
  ]) {
    test(`Given the More menu, When ${name} is chosen, Then its route opens and the menu closes`, async ({
      page,
      quickOnboarding,
    }) => {
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      const menu = page.getByRole('dialog', { name: 'More' });
      await expect(menu).toBeVisible();

      await menu.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(url, { timeout: 20_000 });
      await expect(menu).toBeHidden();
    });
  }
});

for (const { name, url } of [{ name: 'Settings', url: /\/settings$/ }, ...ADVANCED_ENTRIES]) {
  test(`Given the palette, When the ${name} shortcut runs, Then its route opens`, async ({
    page,
    quickOnboarding,
  }) => {
    const palette = await openCommandPalette(page);

    await page.getByLabel('Search commands').fill(name);
    await palette
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^${name}$`) })
      .click();

    await expect(page).toHaveURL(url, { timeout: 20_000 });
    await expect(palette).toBeHidden();
  });
}
