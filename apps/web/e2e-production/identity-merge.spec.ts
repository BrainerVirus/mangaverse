import { readFile } from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

const MANGA_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';
const DUPLICATE_ID = 'merge-dupe';
const DUPLICATE_MAPPING_ID = 'merge-dupe-mapping';
const DUPLICATE_REMOTE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

interface BackupDocument {
  mangaIdentities: {
    id: string;
    canonicalTitle: string;
    providerMappings: Record<string, string>[];
    defaultProviderMappingId: string;
  }[];
  library: { mangaId: string }[];
}

/** Clones the restored title's shape into an unrelated identity with one provider source. */
async function exportWithDuplicate(page: Page): Promise<string> {
  await page.goto('/backup');
  const downloadDone = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).last().click();
  const backup = JSON.parse(
    await readFile(await (await downloadDone).path(), 'utf8'),
  ) as BackupDocument;

  const identity = backup.mangaIdentities.find((item) => item.id === MANGADEX_APP_MANGA_ID);
  if (identity === undefined) throw new Error('backup did not include the seeded title');
  const template = identity.providerMappings[0];
  if (template === undefined) throw new Error('seeded title has no provider mapping');

  backup.mangaIdentities.push({
    ...identity,
    id: DUPLICATE_ID,
    canonicalTitle: TITLE,
    providerMappings: [
      {
        ...template,
        id: DUPLICATE_MAPPING_ID,
        providerMangaId: DUPLICATE_REMOTE_ID,
      },
    ],
    defaultProviderMappingId: DUPLICATE_MAPPING_ID,
  });
  return JSON.stringify(backup);
}

async function restore(page: Page, document: string): Promise<void> {
  await page.goto('/backup');
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'identity-merge.json',
    mimeType: 'application/json',
    buffer: Buffer.from(document),
  });
  await expect(page.getByText('Valid backup')).toBeVisible();
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('Restore complete')).toBeVisible({ timeout: 20_000 });
}

async function mergeThenUnmerge(page: Page): Promise<void> {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);

  await restore(page, await exportWithDuplicate(page));

  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

  const duplicates = page.getByRole('region', { name: 'Possible duplicates' });
  await expect(duplicates.getByRole('button', { name: 'Merge' })).toHaveCount(0);
  await duplicates.getByRole('button', { name: 'Possible duplicates' }).click();
  await expect(duplicates.getByRole('button', { name: 'Merge' })).toBeVisible({
    timeout: 20_000,
  });
  await duplicates.getByRole('button', { name: 'Merge' }).click();

  const mergeDialog = page.getByRole('dialog');
  await expect(mergeDialog.getByText('Merge duplicates')).toBeVisible();
  await expect(mergeDialog.getByRole('region', { name: 'Kept title' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(mergeDialog.getByRole('region', { name: 'Merged title' })).toBeVisible();
  // Both local copies came from the same provider, so the review warns before merging.
  await expect(mergeDialog.getByText(/Both titles have a source on mangadex/)).toBeVisible();
  await mergeDialog.getByRole('button', { name: 'Merge titles' }).click();
  await expect(mergeDialog).toBeHidden({ timeout: 20_000 });

  const providers = page.getByRole('region', { name: 'Providers' });
  await expect(providers.locator('li')).toHaveCount(2);
  await expect(duplicates.getByText('No possible duplicates found.')).toBeVisible();

  const duplicateRow = providers.locator('li').filter({ hasText: DUPLICATE_REMOTE_ID });
  await expect(duplicateRow).toBeVisible();
  await duplicateRow.getByRole('button', { name: 'Split title' }).click();

  const splitDialog = page.getByRole('dialog');
  await expect(splitDialog.getByText('Split provider source into a new title?')).toBeVisible();
  await expect(
    splitDialog.getByText('The new title is not added to your library automatically.'),
  ).toBeVisible();
  await splitDialog.getByRole('button', { name: 'Split source' }).click();
  await expect(splitDialog).toBeHidden({ timeout: 20_000 });
  await expect(providers.locator('li')).toHaveCount(1);
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Providers' }).locator('li')).toHaveCount(1);

  await page.goto('/library');
  const titles = page.getByRole('region', { name: 'Library titles' });
  await expect(titles.getByText(TITLE)).toBeVisible({ timeout: 20_000 });
  await expect(titles.getByText(TITLE)).toHaveCount(1);
}

test('Given two local identities, When merging and unmerging at 390px, Then each title stays reachable with one provider source', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mergeThenUnmerge(page);
  expect(mockMangaDex.count).toBeGreaterThan(0);
});

test('Given a merged title, When unmerging at 1440px, Then the kept title remains in the library', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mergeThenUnmerge(page);
  expect(mockMangaDex.count).toBeGreaterThan(0);
});
