import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { fixturesDir, reloadDurable, test, waitForPingQuiet } from './helpers.js';

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

/** A second manga served by cloning the recorded fixtures under another id. */
async function mockSecondTitle(page: Page, isFeedFailing: () => boolean): Promise<void> {
  const detail = readFixture<{
    data: { id: string; attributes: { title: Record<string, string> } };
  }>('detail.json');
  const secondDetail = structuredClone(detail);
  secondDetail.data.id = SECOND_MANGA_ID;
  secondDetail.data.attributes.title = { en: SECOND_TITLE };

  const feed = readFixture<{ data: { id: string }[] }>('feed.json');
  const secondFeed = {
    ...feed,
    data: feed.data.map((chapter, index) => ({
      ...chapter,
      id: chapter.id.replace(/^[0-9a-f]{8}/, `e2e0000${index + 1}`),
    })),
  };

  await page.route('**/api.mangadex.org/**', async (route) => {
    const url = route.request().url();
    if (url.includes(`/manga/${SECOND_MANGA_ID}/feed`)) {
      if (isFeedFailing()) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ result: 'error' }),
        });
      }
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

/** Adds a chapter to the recorded feed so an update check reports real news. */
async function mockNewChapter(page: Page): Promise<void> {
  const feed = readFixture<{ data: Record<string, unknown>[] }>('feed.json');
  const extended = {
    ...feed,
    data: [
      ...feed.data,
      {
        ...feed.data[0],
        id: 'e2e00000-0000-4000-8000-000000000099',
        attributes: {
          ...(feed.data[0]?.attributes as Record<string, unknown>),
          chapter: '3',
          title: 'New Arrival',
          publishAt: '2026-09-01T00:00:00+00:00',
          readableAt: '2026-09-01T00:00:00+00:00',
        },
      },
    ],
  };

  await page.route('**/api.mangadex.org/**', async (route) => {
    const url = route.request().url();
    if (/\/manga\/[^/?]+\/feed/.test(url) && !url.includes(SECOND_MANGA_ID)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(extended),
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

async function readFirstChapter(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const chapter = page.getByRole('button', { name: /Ch\. 1/ }).first();
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/);
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 20_000 });
  await waitForPingQuiet(page);
}

function updatesRegion(page: Page) {
  return page.getByRole('region', { name: 'Library updates' });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('Given two titles and one failing provider, When updates are checked, Then the report persists and a retry clears it', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let secondFails = false;
  await mockSecondTitle(page, () => secondFails);

  await addTitleToLibrary(page, SECOND_PATH, SECOND_TITLE);
  await addTitleToLibrary(page, MANGA_PATH, TITLE);
  await mockNewChapter(page);

  // Reading one title makes "Continue reading" real; the other stays unread.
  await readFirstChapter(page, MANGA_PATH);
  secondFails = true;

  await page.goto('/library');
  await expect(page.getByRole('region', { name: 'Continue reading' })).toContainText(TITLE);

  await updatesRegion(page).getByRole('button', { name: 'Check for updates' }).click();

  // The provider failure is reported per title; the other title still finishes.
  const status = updatesRegion(page).getByRole('status');
  await expect(status).toContainText('1 new chapter', { timeout: 30_000 });
  await expect(status).toContainText('1 failed');
  const failures = updatesRegion(page).getByRole('list', { name: 'Update failures' });
  await expect(failures).toContainText(SECOND_TITLE);
  await expect(failures).toContainText('Failed');

  // The last report survives a reload.
  await reloadDurable(page);
  await expect(updatesRegion(page).getByRole('status')).toContainText('1 failed', {
    timeout: 20_000,
  });
  await expect(updatesRegion(page).getByRole('list', { name: 'Update failures' })).toContainText(
    SECOND_TITLE,
  );

  // Retry only the failed title; the merged report has no failures left.
  secondFails = false;
  await updatesRegion(page)
    .getByRole('listitem')
    .filter({ hasText: SECOND_TITLE })
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(updatesRegion(page).getByRole('status')).toContainText('2 checked', {
    timeout: 30_000,
  });
  await expect(updatesRegion(page).getByRole('status')).not.toContainText('failed');
  await expect(updatesRegion(page).getByRole('list', { name: 'Update failures' })).toHaveCount(0);
});

test('Given a phone viewport, When the library and a title are opened, Then sections fit, status persists and progress resumes', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSecondTitle(page, () => false);

  await addTitleToLibrary(page, MANGA_PATH, TITLE);
  await addTitleToLibrary(page, SECOND_PATH, SECOND_TITLE);
  await readFirstChapter(page, MANGA_PATH);

  await page.goto('/library');
  await expect(page.getByRole('region', { name: 'Continue reading' })).toContainText(TITLE);
  await expect(page.getByRole('region', { name: 'Recently updated' })).toContainText(SECOND_TITLE);
  await expectNoHorizontalOverflow(page);

  // Quick status picker on the detail page, persisted with the entry.
  await page.goto(MANGA_PATH);
  await page.getByLabel('Reading status').click();
  await page.getByRole('option', { name: 'Completed' }).click();
  await waitForPingQuiet(page);
  await reloadDurable(page);
  await expect(page.getByLabel('Reading status')).toContainText('Completed', {
    timeout: 20_000,
  });
  await expectNoHorizontalOverflow(page);

  // The resume tile opens the reader on the chapter that was last read.
  await page.goto('/library');
  const continueSection = page.getByRole('region', { name: 'Continue reading' });
  await expect(continueSection).toContainText(TITLE);
  await continueSection.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/reader\/dev-md-ch-/);
  await expect(page.getByTestId('reader-surface')).toBeVisible({ timeout: 20_000 });
});
