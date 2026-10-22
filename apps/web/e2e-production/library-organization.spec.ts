import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { fixturesDir, test, waitForPingQuiet } from './helpers.js';

const MANGA_PATH = '/manga/dev-md-dc332d04-d3b0-413c-a767-70f5e451b031';
const TITLE = 'Kuro no Shoukanshi';

const SECOND_MANGA_ID = 'e2e00000-0000-4000-8000-000000000002';
const SECOND_TITLE = 'Second Signal';
const SECOND_PATH = `/manga/dev-md-${SECOND_MANGA_ID}`;

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(`${fixturesDir}/${name}`, 'utf8')) as T;
}

/**
 * Serves a second manga by cloning the recorded fixtures under another id.
 * Registered after the shared mock, so it wins for these URLs and delegates
 * everything else back to the recorded responses.
 */
async function mockSecondTitle(page: Page): Promise<void> {
  const detail = readFixture<{
    data: { id: string; attributes: { title: Record<string, string> } };
  }>('detail.json');
  const secondDetail = structuredClone(detail);
  secondDetail.data.id = SECOND_MANGA_ID;
  secondDetail.data.attributes.title = { en: SECOND_TITLE };

  const feed = readFixture<{ data: { id: string }[] }>('feed.json');
  const secondFeed = {
    ...feed,
    // Chapter and page ids derive from the provider chapter id, so the clone
    // needs distinct ids per chapter.
    data: feed.data.map((chapter, index) => ({
      ...chapter,
      id: chapter.id.replace(/^[0-9a-f]{8}/, `e2e0000${index + 1}`),
    })),
  };

  await page.route('**/api.mangadex.org/**', async (route) => {
    const url = route.request().url();
    if (url.includes(`/manga/${SECOND_MANGA_ID}/feed`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(secondFeed),
      });
    }
    if (new RegExp(`/manga/${SECOND_MANGA_ID}(\\?|$)`).test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(secondDetail),
      });
    }
    return route.fallback();
  });
}

async function addTitleToLibrary(page: Page, path: string, title: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);
  await page.goto('/library');
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });
}

async function addToLibrary(page: Page): Promise<void> {
  await addTitleToLibrary(page, MANGA_PATH, TITLE);
}

async function readFirstChapter(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const chapter = page.getByRole('button', { name: /Ch\. 1/ }).first();
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/);
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 20_000 });
  // The full quiet window covers the 750 ms progress debounce and its flush.
  await waitForPingQuiet(page);
}

async function selectSort(page: Page, label: string): Promise<void> {
  await page.getByLabel('Sort library').click();
  await page.getByRole('option', { name: label }).click();
}

async function expectCardTitles(page: Page, titles: readonly string[]): Promise<void> {
  await expect(page.locator('[data-library-card] h3')).toHaveText(titles);
}

async function createCategory(page: Page, name: string, pin = true): Promise<void> {
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByLabel('New category').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  if (pin) {
    await page.getByRole('button', { name: `Pin ${name}` }).click();
    await expect(page.getByRole('button', { name: `Unpin ${name}` })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 20_000 });
}

async function assignCategoryToTitle(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Select titles' }).click();
  await page.getByLabel(`Select ${TITLE}`).check();
  await page.getByRole('button', { name: 'Bulk categories' }).click();
  await page.getByLabel(name, { exact: true }).check();
  await page.getByRole('button', { name: 'Add to selected' }).click();
  await waitForPingQuiet(page);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('Given a library title, When a category is created, assigned, filtered, sorted and bulk-edited, Then it survives a reload', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await addToLibrary(page);

  await createCategory(page, 'Fantasy');
  await assignCategoryToTitle(page, 'Fantasy');

  // Category filter narrows the library to the assigned title.
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);
  await expect(page.getByText('1 title')).toBeVisible();

  // Sort by title keeps the same result and is a real select interaction.
  await page.getByLabel('Sort library').click();
  await page.getByRole('option', { name: 'Title · A–Z' }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);

  // Bulk favorite and status changes on the selected title.
  await page.getByRole('button', { name: 'Favorites' }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Favorites' }).click();

  await page.getByLabel(`Select ${TITLE}`).check();
  await page.getByRole('button', { name: 'Favorite selected', exact: true }).click();
  await page.getByLabel('Set status for selected').click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite selected' })).toBeEnabled();
  await waitForPingQuiet(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });

  // Pinned category and filters survive with the stored data.
  await expect(page.getByRole('button', { name: 'Fantasy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);

  await page.getByLabel('Filter by status').click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-library-card]').first()).toBeVisible();

  // The title detail reads back the persisted favorite and category.
  await page.goto(MANGA_PATH);
  await expect(page.getByRole('button', { name: 'Favorited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Fantasy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Given two titles read in order, When a newer-added title is favorited, Then last read still follows reading time', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSecondTitle(page);

  // Second Signal is added first, so Kuro is the newer-added title.
  await addTitleToLibrary(page, SECOND_PATH, SECOND_TITLE);
  await addTitleToLibrary(page, MANGA_PATH, TITLE);

  await readFirstChapter(page, MANGA_PATH);
  await readFirstChapter(page, SECOND_PATH);
  await page.goto('/library');
  await expect(page.locator('[data-library-card]')).toHaveCount(2);

  // Reading order, newest first. The quiet window between reads orders the
  // read-state timestamps.
  await selectSort(page, 'Last read · recent');
  await expect(page.getByLabel('Sort library')).toContainText('Last read · recent');
  await expectCardTitles(page, [SECOND_TITLE, TITLE]);

  // Favoriting bumps library_entries.updated_at; it must not count as a read.
  await page.getByRole('button', { name: 'Select titles' }).click();
  await page.getByLabel(`Select ${TITLE}`).check();
  await page.getByRole('button', { name: 'Favorite selected', exact: true }).click();
  await waitForPingQuiet(page);
  await expectCardTitles(page, [SECOND_TITLE, TITLE]);

  // Reading the other title now moves it first, and the change survives a reload.
  await readFirstChapter(page, MANGA_PATH);
  await page.goto('/library');
  await selectSort(page, 'Last read · recent');
  await expectCardTitles(page, [TITLE, SECOND_TITLE]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-library-card]')).toHaveCount(2, { timeout: 20_000 });
  await selectSort(page, 'Last read · recent');
  await expectCardTitles(page, [TITLE, SECOND_TITLE]);

  // The other new sort options query real columns and keep both titles.
  for (const label of ['Unread · most', 'Progress · furthest', 'Provider · A–Z']) {
    await selectSort(page, label);
    await expect(page.getByLabel('Sort library')).toContainText(label);
    await expect(page.locator('[data-library-card]')).toHaveCount(2);
  }
});

test('Given a phone viewport, When categories are organized, Then the toolbar wraps and pinning persists', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addToLibrary(page);
  await expectNoHorizontalOverflow(page);

  await createCategory(page, 'Mobile shelf', false);
  await expectNoHorizontalOverflow(page);

  // Pin through the manager on the narrow viewport.
  await page.getByRole('button', { name: 'Manage categories' }).click();
  await page.getByRole('button', { name: 'Pin Mobile shelf' }).click();
  await expect(page.getByRole('button', { name: 'Unpin Mobile shelf' })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await assignCategoryToTitle(page, 'Mobile shelf');
  await page.getByRole('button', { name: 'Mobile shelf', exact: true }).click();
  await expect(page.locator('[data-library-card]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);

  await waitForPingQuiet(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Mobile shelf', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
