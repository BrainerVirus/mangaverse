import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

const MANGA_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';
const CATEGORY = 'Backup shelf';
const TARGET_MANIFEST_URL = 'https://e2e.example/backup-target/manifest.json';

const TARGET_MANIFEST = {
  id: 'backup-target',
  name: 'Backup Target',
  version: '1.0.0',
  source: { url: 'https://e2e.example/backup-target' },
  compatibility: { platforms: ['web', 'desktop'], minAppVersion: '1.0.0' },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

interface BackupChapter {
  id: string;
  mangaId: string;
  title: string;
}

interface BackupDocument {
  schemaVersion: number;
  library: { categoryIds: string[]; lastReadChapterId?: string }[];
  categories?: { id: string; name: string; pinned?: boolean }[];
  chapters?: BackupChapter[];
  chapterReadStates?: { chapterId: string; progress: { lastPageIndex: number } }[];
  readingHistory?: unknown[];
  migrationHistory?: unknown[];
}

async function addToLibrary(page: Page): Promise<void> {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);
  await page.goto('/library');
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });
}

async function createPinnedCategory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByLabel('New category').fill(CATEGORY);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: `Pin ${CATEGORY}` }).click();
  await expect(page.getByRole('button', { name: `Unpin ${CATEGORY}` })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: CATEGORY, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Select titles' }).click();
  await page.getByLabel(`Select ${TITLE}`).check();
  await page.getByRole('button', { name: 'Bulk categories' }).click();
  await page.getByLabel(CATEGORY, { exact: true }).check();
  await page.getByRole('button', { name: 'Add to selected' }).click();
  await waitForPingQuiet(page);
}

async function deleteCategory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByRole('button', { name: `Delete ${CATEGORY}` }).click();
  await page.getByRole('button', { name: `Confirm delete ${CATEGORY}` }).click();
  await expect(page.getByRole('button', { name: `Delete ${CATEGORY}` })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: CATEGORY, exact: true })).toHaveCount(0);
  await waitForPingQuiet(page);
}

async function openReaderAt(page: Page, currentPage: number): Promise<void> {
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  const continueReading = page.getByRole('button', { name: 'Continue reading' });
  if ((await continueReading.count()) > 0) {
    await continueReading.click();
  } else {
    const chapter = page.getByRole('button', { name: /Ch\. 1 - The Summoner/ });
    await expect(chapter).toBeVisible({ timeout: 30_000 });
    await chapter.click({ force: true });
  }
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`${currentPage} / 37`)).toBeVisible({ timeout: 30_000 });
}

async function readToPage(page: Page, fromPage: number, toPage: number): Promise<void> {
  await openReaderAt(page, fromPage);
  for (let index = fromPage; index < toPage; index += 1) {
    await page.getByRole('button', { name: 'Next page' }).click();
  }
  await expect(page.getByText(`${toPage} / 37`)).toBeVisible();
  await waitForPingQuiet(page);
}

async function closeReader(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close reader' }).click();
  await expect(page).not.toHaveURL(/\/reader\//);
}

async function installTargetProvider(page: Page): Promise<void> {
  await page.route(TARGET_MANIFEST_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TARGET_MANIFEST),
    });
  });
  await page.goto('/extensions?install=1');
  await page.getByLabel('Manifest URL').fill(TARGET_MANIFEST_URL);
  await page.getByRole('button', { name: 'Review manifest' }).click();
  await page.getByRole('button', { name: 'Confirm install' }).click();
  await expect(page.getByRole('dialog', { name: 'Install provider' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByText('Backup Target').first()).toBeVisible({ timeout: 20_000 });
}

async function selectProvider(page: Page, name: string, provider: string): Promise<void> {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: provider, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function migrateToTarget(page: Page): Promise<void> {
  await page.goto('/migration');
  await selectProvider(page, 'Source provider', 'MangaDex');
  await selectProvider(page, 'Target provider', 'Backup Target');

  const candidate = page.locator('ul[aria-label="Migration candidates"] > li').first();
  await expect(candidate).toBeVisible({ timeout: 30_000 });
  await candidate.getByLabel('Target provider manga id').fill('backup-target-remote');
  await page.getByRole('button', { name: 'Preview migration' }).click();
  await expect(page.getByText('1 title(s) ready to migrate. 0 blocked.')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Review and apply' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review migration' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm migration' }).click();
  await expect(page.getByText('1 title(s) migrated. 0 skipped.')).toBeVisible({
    timeout: 30_000,
  });
  await waitForPingQuiet(page);
}

async function exportBackup(page: Page): Promise<BackupDocument> {
  await page.goto('/backup');
  const downloadDone = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).last().click();
  const json = readFileSync(await (await downloadDone).path(), 'utf8');
  return JSON.parse(json) as BackupDocument;
}

async function restoreBackup(page: Page, backup: BackupDocument): Promise<void> {
  await page.goto('/backup');
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'backup-complete.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByText('Valid backup')).toBeVisible();

  const contents = page.locator('dl[aria-label="Backup contents"]');
  await expect(contents).toContainText('Categories');
  await expect(contents).toContainText('Chapter progress');
  await expect(contents).toContainText('Reading history');
  await expect(contents).toContainText('Migration history');

  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('Restore complete')).toBeVisible({ timeout: 30_000 });
  await waitForPingQuiet(page);
}

test('Given a backup with categories, read state and migration history, When local data changes and the backup is restored, Then the backup copy is persisted', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await addToLibrary(page);
  await createPinnedCategory(page);
  await readToPage(page, 1, 3);
  await closeReader(page);

  await installTargetProvider(page);
  await migrateToTarget(page);
  const history = page.getByRole('list', { name: 'Migration history' });
  await expect(history.getByRole('listitem')).toHaveCount(1);

  const backup = await exportBackup(page);
  expect(backup.schemaVersion).toBe(4);
  expect(backup.categories).toEqual([expect.objectContaining({ name: CATEGORY, pinned: true })]);
  expect(backup.library[0]?.categoryIds).toEqual([backup.categories?.[0]?.id]);
  expect(backup.chapters?.length).toBeGreaterThan(0);
  expect(backup.chapterReadStates).toEqual([
    expect.objectContaining({ progress: expect.objectContaining({ lastPageIndex: 2 }) }),
  ]);
  expect(backup.migrationHistory).toHaveLength(1);

  // Edit every restored section after the export.
  await page.goto('/library');
  await deleteCategory(page);
  await readToPage(page, 3, 5);
  await closeReader(page);

  await migrateToTarget(page);
  await expect(
    page.getByRole('list', { name: 'Migration history' }).getByRole('listitem'),
  ).toHaveCount(2);

  await restoreBackup(page, backup);

  // Category definitions, pin and membership come back.
  await page.goto('/library');
  await expect(page.locator('[data-library-card]')).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole('button', { name: CATEGORY, exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await expect(page.getByRole('button', { name: `Unpin ${CATEGORY}` })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // Read state comes back with its chapter metadata, so Continue reading opens page 3.
  await openReaderAt(page, 3);
  await closeReader(page);

  // Migration history is the exported row again, not the two local rows.
  await page.goto('/migration');
  const restoredHistory = page.getByRole('list', { name: 'Migration history' });
  await expect(restoredHistory.getByRole('listitem')).toHaveCount(1, { timeout: 20_000 });
  await expect(restoredHistory.getByText(TITLE)).toBeVisible();
});
