import { readFile } from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';

import { currentPing, reloadDurable, test, waitForNewPing, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

/** Client-side navigation: a full document load would reset the query cache under test. */
async function openAppSettingsFromBackup(page: Page): Promise<void> {
  // The desktop rail and the bottom bar both render a "Settings" link; only one is visible.
  await page.locator('a[aria-label="Settings"]:visible').click();
  await expect(page).toHaveURL(/\/settings$/, { timeout: 20_000 });
  await page.getByRole('button', { name: /^App\b/ }).click();
  await expect(page).toHaveURL(/\/settings\/app$/, { timeout: 20_000 });
}

test('Given a backup exported before a settings edit, When restored, Then app settings show the restored row without a reload', async ({
  page,
  quickOnboarding,
}) => {
  // Exported state: explicit content on.
  await page.goto('/settings/app');
  const explicit = page.getByRole('switch', { name: 'Explicit content' });
  await expect(explicit).not.toBeChecked();
  const beforeExport = await currentPing(page);
  await explicit.click();
  await expect(explicit).toBeChecked();
  await waitForNewPing(page, beforeExport);

  await page.goto('/backup');
  const downloadDone = page.waitForEvent('download');
  // The collapsible section header is also a button named after its title.
  await page.getByRole('button', { name: 'Export backup' }).last().click();
  const backupJson = await readFile(await (await downloadDone).path(), 'utf8');

  // Edit after the export, so the restore has something to roll back.
  await page.goto('/settings/app');
  const beforeEdit = await currentPing(page);
  await page.getByRole('switch', { name: 'Explicit content' }).click();
  await expect(page.getByRole('switch', { name: 'Explicit content' })).not.toBeChecked();
  await waitForNewPing(page, beforeEdit);

  await page.goto('/backup');
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupJson),
  });
  await expect(page.getByText('Valid backup')).toBeVisible();
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('Restore complete')).toBeVisible({ timeout: 20_000 });

  // No document reload: only the restore's settings invalidation makes the
  // open settings query drop its pre-restore cache entry.
  await openAppSettingsFromBackup(page);
  await expect(page.getByRole('switch', { name: 'Explicit content' })).toBeChecked();

  // The next edit must save the restored row, not the stale one, so a reload
  // cannot flip explicit content back off.
  await page.getByRole('switch', { name: 'Motion' }).click();
  await waitForPingQuiet(page);
  await reloadDurable(page);
  await expect(page.getByRole('switch', { name: 'Explicit content' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Motion' })).toBeChecked();
});

test('Given a typed language list, When it is committed, Then invalid fragments are dropped and the list persists', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/settings/app');

  const languages = page.getByLabel('Preferred languages');
  await expect(languages).toHaveValue('en');

  await languages.fill('en, zzz');
  await languages.press('Tab');
  await expect(languages).toHaveValue('en');

  const beforeCommit = await currentPing(page);
  await languages.fill('en, ja');
  await languages.press('Enter');
  await expect(languages).toHaveValue('en, ja');
  await waitForNewPing(page, beforeCommit);

  await reloadDurable(page);
  await expect(page.getByLabel('Preferred languages')).toHaveValue('en, ja');
});
