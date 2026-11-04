import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { fixturesDir, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

// Binary order would be Zebra, apple, Éclair; the Unicode fold gives apple, Éclair, Zebra.
const TITLES = [
  { id: 'e2e00000-0000-4000-8000-00000000a001', title: 'Zebra' },
  { id: 'e2e00000-0000-4000-8000-00000000a002', title: 'Éclair' },
  { id: 'e2e00000-0000-4000-8000-00000000a003', title: 'apple' },
] as const;

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(`${fixturesDir}/${name}`, 'utf8')) as T;
}

/** Serves each title as a clone of the recorded detail and feed under its own ids. */
async function mockTitles(page: Page): Promise<void> {
  const detail = readFixture<{
    data: { id: string; attributes: { title: Record<string, string> } };
  }>('detail.json');
  const feed = readFixture<{ data: { id: string }[] }>('feed.json');

  await page.route('**/api.mangadex.org/**', async (route) => {
    const url = route.request().url();
    const index = TITLES.findIndex((entry) => url.includes(`/manga/${entry.id}`));
    const entry = TITLES[index];
    if (entry === undefined) return route.fallback();

    if (url.includes(`/manga/${entry.id}/feed`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...feed,
          // Chapters are keyed globally, so each title needs distinct chapter ids.
          data: feed.data.map((chapter, chapterIndex) => ({
            ...chapter,
            id: chapter.id.replace(/^[0-9a-f]{8}/, `e2e${index}00${chapterIndex}`),
          })),
        }),
      });
    }
    const clone = structuredClone(detail);
    clone.data.id = entry.id;
    clone.data.attributes.title = { en: entry.title };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(clone),
    });
  });
}

async function addTitleToLibrary(page: Page, id: string, title: string): Promise<void> {
  await page.goto(`/manga/dev-md-${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);
}

test('Given accented titles in the persisted library, When it is reloaded, sorted and searched, Then the Unicode fold still applies', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockTitles(page);

  for (const { id, title } of TITLES) {
    await addTitleToLibrary(page, id, title);
  }

  // A reload reopens the database from the flushed IndexedDB bytes, where sql.js has
  // dropped every JS-registered function unless the session registered them again.
  await page.goto('/library');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-library-card]')).toHaveCount(TITLES.length, {
    timeout: 20_000,
  });

  await page.getByLabel('Sort library').click();
  await page.getByRole('option', { name: 'Title · A–Z' }).click();
  await expect(page.locator('[data-library-card] h3')).toHaveText(['apple', 'Éclair', 'Zebra']);

  const search = page.getByLabel('Search library');
  for (const query of ['éclair', 'ÉCLAIR']) {
    await search.fill(query);
    await expect(page.locator('[data-library-card] h3')).toHaveText(['Éclair']);
  }
  await search.fill('');
  await expect(page.locator('[data-library-card]')).toHaveCount(TITLES.length);
});
