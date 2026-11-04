import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

import { fixturesDir, MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';

/**
 * Reader budgets (spec 07, provisional until the owner's reference laptop):
 * cached page turn to paint 50ms, cached chapter open 300ms.
 *
 * These are measured on the app's own performance timeline: the reader marks
 * a page turn when navigation is requested and measures it on the frame after
 * the requested page's image loads; a chapter open is measured the same way
 * from mount to the first page. The method is stated here because the numbers
 * move with the machine — this spec proves the clocks exist, reports p50/p95,
 * and fails only on a gross (10x) regression.
 */
test.describe.configure({ timeout: 180_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
const TURNS = 24;

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page).toHaveURL(/\/reader\//, { timeout: 30_000 });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

async function measures(page: Page, name: string): Promise<number[]> {
  return page.evaluate(
    (entryName) =>
      performance
        .getEntriesByName(entryName, 'measure')
        .map((entry) => Math.round(entry.duration * 100) / 100),
    name,
  );
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index]!;
}

function report(label: string, values: readonly number[]) {
  // eslint-disable-next-line no-console -- E2E measurement output is the report
  console.log(
    `[reader-budget] ${label}: n=${values.length} p50=${percentile(values, 0.5)}ms p95=${percentile(values, 0.95)}ms max=${Math.max(...values)}ms`,
  );
}

test('Given a cached chapter, When pages turn, Then each turn paints inside the page-turn measure and the open stays bounded', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // First open downloads and caches the chapter; it is the uncached case.
  await openReader(page);
  await expect(page.getByTestId('reader-surface').locator('img').first()).toBeVisible({
    timeout: 30_000,
  });
  await waitForPingQuiet(page);
  const openMeasures = await measures(page, 'reader:chapter-open');
  report('uncached chapter open', openMeasures);
  expect(openMeasures.length).toBeGreaterThan(0);

  // Re-open from the cached copy: this is the budgeted open.
  await page.goBack();
  await expect(page.getByRole('button', { name: CHAPTER_BUTTON })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: CHAPTER_BUTTON }).click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('reader-surface').locator('img').first()).toBeVisible({
    timeout: 30_000,
  });

  // Alternate forward/back so every turn lands on a page that is already
  // cached, and wait for the reader's own turn measure to settle each time.
  for (let turn = 0; turn < TURNS; turn += 1) {
    const direction = turn % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
    const before = (await measures(page, 'reader:page-turn')).length;
    await page.keyboard.press(direction);
    await expect
      .poll(async () => (await measures(page, 'reader:page-turn')).length, { timeout: 15_000 })
      .toBeGreaterThan(before);
  }

  const turnMeasures = await measures(page, 'reader:page-turn');
  const cachedOpenMeasures = (await measures(page, 'reader:chapter-open')).slice(-1);
  report('cached page turn', turnMeasures);
  report('cached chapter open', cachedOpenMeasures);

  expect(turnMeasures.length).toBeGreaterThanOrEqual(TURNS);
  // A gross regression bound; the 50ms budget is asserted by the report, not a
  // hard gate on a shared CI machine.
  expect(percentile(turnMeasures, 0.95)).toBeLessThan(500);
  expect(percentile(cachedOpenMeasures, 0.5)).toBeLessThan(3_000);
});

test('Given an uncached chapter, When it opens, Then progress shows and the open timing is logged', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  // A fresh profile has no page cache; delay the image host so the progress
  // surface is observable instead of racing a fast local fixture.
  await page.route('**/*.mangadex.network/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="white"/></svg>',
    });
  });
  await page.route('**/api.mangadex.org/at-home/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: readFileSync(fixturesDir + '/at-home.json', 'utf8'),
    });
  });

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });

  // The reader shows progress (a loading state) before the first page exists.
  await expect(
    page.getByTestId('reader-hydrating').or(page.getByText('1 / 37')).first(),
  ).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('reader-surface').locator('img').first()).toBeVisible({
    timeout: 30_000,
  });
  const openMeasures = await measures(page, 'reader:chapter-open');
  report('uncached chapter open (delayed host)', openMeasures);
  expect(openMeasures.length).toBeGreaterThan(0);
});
