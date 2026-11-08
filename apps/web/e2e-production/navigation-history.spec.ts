import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { MANGADEX_APP_MANGA_ID, showReaderControls, test } from './helpers.js';
import { fixturesDir } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

async function index(page: Page) {
  return page.evaluate(() => ({
    index: history.state.__TSR_index as number,
    length: history.length,
  }));
}

async function openChapter(page: Page) {
  const chapter = page.getByRole('button', { name: /Ch\. 1 - The Summoner/ }).first();
  await expect(chapter).toBeEnabled({ timeout: 30_000 });
  await chapter.click();
  await expect(page).toHaveURL(/\/reader\//);
  await expect(page.getByTestId('reader-page-number')).toBeAttached({ timeout: 30_000 });
}

for (const width of [390, 1440]) {
  for (const origin of ['library', 'discover', 'search'] as const) {
    test(`${origin} ${width}: close returns to detail and Back returns to origin`, async ({
      page,
      quickOnboarding,
      mockMangaDex,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (origin === 'library') {
        await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
        await page.getByRole('button', { name: 'Add to library' }).click();
        await expect(
          page.getByRole('button', { name: /Remove from library|In library/ }).first(),
        ).toBeVisible({ timeout: 30_000 });
      }
      await page.goto(`/${origin}`);
      if (origin === 'search')
        await page.getByRole('searchbox', { name: 'Search manga' }).fill('berserk');
      const card = page.getByRole('button', { name: /Kuro no Shoukanshi/ }).first();
      await expect(card).toBeVisible({ timeout: 30_000 });
      const start = await index(page);
      await card.click();
      await expect(page).toHaveURL(/\/manga\//);
      await openChapter(page);
      const reader = await index(page);
      expect(reader.index).toBe(start.index + 2);
      await showReaderControls(page);
      await page.getByRole('button', { name: 'Close reader' }).first().click();
      await expect(page).toHaveURL(/\/manga\//);
      expect(await index(page)).toEqual({ index: start.index + 1, length: reader.length });
      await page.getByRole('button', { name: 'Back', exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`/${origin}(?:\\?|$)`));
      expect(await index(page)).toEqual({ index: start.index, length: reader.length });
    });
  }
}

test('Continue reading closes to library without pushing detail', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(
    page.getByRole('button', { name: /Remove from library|In library/ }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await openChapter(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(2500);
  await page.goto('/library');
  const resume = page.getByRole('region', { name: 'Continue reading' }).getByRole('button').first();
  await expect(resume).toBeVisible({ timeout: 30_000 });
  const start = await index(page);
  await resume.click();
  await expect(page).toHaveURL(/\/reader\//);
  const reader = await index(page);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/library$/);
  expect(await index(page)).toEqual({ index: start.index, length: reader.length });
});

test('fresh reader deep link replaces itself and detail Back replaces with library', async ({
  page,
  context,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await openChapter(page);
  const readerPath = new URL(page.url()).pathname;
  const fresh = await context.newPage();
  await fresh.goto(readerPath);
  await expect(fresh.getByTestId('reader-page-number')).toBeAttached({ timeout: 30_000 });
  const start = await index(fresh);
  await fresh.keyboard.press('Escape');
  await expect(fresh).toHaveURL(/\/manga\//);
  expect(await index(fresh)).toEqual(start);
  await fresh.getByRole('button', { name: 'Back', exact: true }).first().click();
  await expect(fresh).toHaveURL(/\/library$/);
  expect(await index(fresh)).toEqual(start);
  await fresh.close();
});

test('next and previous chapters replace the same reader session entry', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  const feed = JSON.parse(readFileSync(`${fixturesDir}/feed.json`, 'utf8'));
  const first = feed.data[0];
  feed.data = [
    first,
    {
      ...first,
      id: 'b6949b69-6d7a-466c-a428-ab9b086ebe35',
      attributes: { ...first.attributes, chapter: '2', title: 'Second' },
    },
  ];
  feed.total = 2;
  await page.route(/\/manga\/[^/?]+\/feed/, (route) => route.fulfill({ json: feed }));
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await openChapter(page);
  const firstPath = new URL(page.url()).pathname;
  const before = await index(page);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page).not.toHaveURL(new RegExp(`${firstPath}$`));
  await expect(page.getByTestId('reader-page-number')).toBeAttached({ timeout: 30_000 });
  expect(await index(page)).toEqual(before);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(page).toHaveURL(new RegExp(`${firstPath}$`));
  await expect(page.getByTestId('reader-page-number')).toBeAttached({ timeout: 30_000 });
  expect(await index(page)).toEqual(before);
  await showReaderControls(page);
  await page.getByRole('button', { name: 'Close reader' }).first().click();
  await expect(page).toHaveURL(/\/manga\//);
  expect(await index(page)).toEqual({ index: before.index - 1, length: before.length });
});
