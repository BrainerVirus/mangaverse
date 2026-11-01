import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';

import { fixturesDir, MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const MANGA_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';
const SOURCE_REMOTE_ID = MANGADEX_APP_MANGA_ID.replace('dev-md-', '');
const SECOND_MAPPING_ID = 'mapping-second-source';
const SECOND_REMOTE_ID = 'ffffffff-1111-2222-3333-444444444444';

/**
 * Serves distinct chapter feeds per mapping: a full 138-chapter title for the
 * original (the audit's long list) and three chapters for the added one.
 */
async function mockMappingFeeds(page: Page): Promise<void> {
  const feedFor = (chapterCount: number, prefix: string): string => {
    const feed = JSON.parse(readFileSync(`${fixturesDir}/feed.json`, 'utf8')) as {
      data: { id: string; attributes: Record<string, unknown> }[];
    };
    const template = feed.data[0]!;
    feed.data = Array.from({ length: chapterCount }, (_, index) => ({
      ...template,
      id: `${prefix}-chapter-${index + 1}`,
      attributes: {
        ...template.attributes,
        chapter: String(index + 1),
        title: `Chapter ${index + 1}`,
      },
    }));
    return JSON.stringify(feed);
  };

  await page.route('**/api.mangadex.org/**', async (route) => {
    const url = route.request().url();
    if (/\/feed/.test(url)) {
      const body = url.includes(SECOND_REMOTE_ID)
        ? feedFor(3, SECOND_REMOTE_ID)
        : url.includes(SOURCE_REMOTE_ID)
          ? feedFor(138, SOURCE_REMOTE_ID)
          : undefined;
      if (body !== undefined) {
        await route.fulfill({ status: 200, contentType: 'application/json', body });
        return;
      }
    }
    await route.fallback();
  });
}

async function exportWithSecondMapping(page: Page): Promise<string> {
  await page.goto('/backup');
  const downloadDone = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).last().click();
  const backup = JSON.parse(await readFile(await (await downloadDone).path(), 'utf8')) as {
    mangaIdentities: { id: string; providerMappings: Record<string, string>[] }[];
    library: { mangaId: string; activeProviderMappingId?: string; unreadCount: number }[];
  };

  const identity = backup.mangaIdentities.find((item) => item.id === MANGADEX_APP_MANGA_ID);
  if (identity === undefined) throw new Error('backup did not include the added title');
  identity.providerMappings.push({
    id: SECOND_MAPPING_ID,
    providerId: 'mangadex',
    providerMangaId: SECOND_REMOTE_ID,
  });
  const entry = backup.library.find((item) => item.mangaId === MANGADEX_APP_MANGA_ID);
  if (entry === undefined) throw new Error('backup did not include the library entry');
  entry.activeProviderMappingId = SECOND_MAPPING_ID;
  entry.unreadCount = 0;

  return JSON.stringify(backup);
}

async function restore(page: Page, document: string): Promise<void> {
  await page.goto('/backup');
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'two-mappings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(document),
  });
  await expect(page.getByText('Valid backup')).toBeVisible();
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('Restore complete')).toBeVisible({ timeout: 20_000 });
}

test('Given two MangaDex mappings, When switching, setting default and choosing a chapter source, Then the badge and chapter count follow the active mapping and persist', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await mockMappingFeeds(page);

  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);

  await restore(page, await exportWithSecondMapping(page));

  const providers = page.getByRole('region', { name: 'Providers' });
  const sourceRow = providers.locator('li').filter({ hasText: SOURCE_REMOTE_ID });
  const secondRow = providers.locator('li').filter({ hasText: SECOND_REMOTE_ID });

  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(providers.locator('li')).toHaveCount(2);
  // The restored active mapping hydrates its own three chapters and badge.
  await expect(secondRow.getByText('Viewing', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chapter-summary')).toHaveText('3 unread');
  await expect(page.getByRole('region', { name: 'Chapters' }).locator('ol > li')).toHaveCount(3);

  await page.goto('/library');
  const libraryTitles = page.getByRole('region', { name: 'Library titles' });
  await expect(libraryTitles.getByText('3 unread')).toBeVisible({ timeout: 20_000 });

  // Switching to the other mapping re-counts from its own chapters.
  await page.goto(MANGA_PATH);
  await expect(sourceRow.getByRole('button', { name: 'View chapters' })).toBeVisible();
  await sourceRow.getByRole('button', { name: 'View chapters' }).click();
  await expect(sourceRow.getByText('Viewing', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chapter-summary')).toHaveText('138 unread');

  // The long list mounts a window, not 138 rows; the last chapter still comes
  // into reach by scrolling and opens from the keyboard.
  const chapterList = page.getByRole('list', { name: 'Chapters' });
  const mountedRows = chapterList.locator('li');
  await expect(chapterList).toHaveAttribute('data-virtualized', '');
  expect(await mountedRows.count()).toBeGreaterThan(0);
  expect(await mountedRows.count()).toBeLessThan(40);

  await page.locator('main').evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const lastChapter = page.getByRole('button', { name: 'Open Chapter 138' });
  await expect(lastChapter).toBeVisible({ timeout: 10_000 });
  await lastChapter.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/reader\//, { timeout: 20_000 });

  await page.goto(MANGA_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

  await secondRow.getByRole('button', { name: 'Set default' }).click();
  await expect(secondRow.getByText('Default', { exact: true })).toBeVisible();
  await expect(sourceRow.getByText('Default', { exact: true })).toHaveCount(0);

  await secondRow.getByRole('button', { name: 'Use for chapters' }).click();
  await expect(secondRow.getByText('Chapter source', { exact: true })).toBeVisible();
  await expect(secondRow.getByText('Viewing', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chapter-summary')).toHaveText('3 unread');
  await waitForPingQuiet(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(secondRow.getByText('Default', { exact: true })).toBeVisible();
  await expect(secondRow.getByText('Chapter source', { exact: true })).toBeVisible();
  await expect(secondRow.getByText('Viewing', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chapter-summary')).toHaveText('3 unread');

  await page.goto('/library');
  await expect(libraryTitles.getByText('3 unread')).toBeVisible({ timeout: 20_000 });
  expect(mockMangaDex.count).toBeGreaterThan(0);
});
