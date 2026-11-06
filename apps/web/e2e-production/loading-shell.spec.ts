import { expect, type Locator, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test, waitForPingQuiet } from './helpers.js';
import { holdLocalDatabase, observeLayoutShift, readShifts, sumShifts } from './loading-shift.js';

test.describe.configure({ timeout: 180_000 });

/** A page may move by less than this once its data arrives (CLS units). */
const CLS_BUDGET = 0.02;
/** The library's rows sit under data-dependent shelves; the Web Vitals "good" bound applies. */
const LIBRARY_CLS_BUDGET = 0.1;
/** Static chrome must not move at all once its data arrives, within sub-pixel rounding. */
const SHELL_TOLERANCE_PX = 1;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The element's box once it has stopped moving. The route's enter transition slides the page in
 * for a moment; a box read mid-slide would blame the loading state for the animation.
 */
async function boxOf(locator: Locator): Promise<Box> {
  let previous: Box | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const box = await locator.boundingBox();
    if (box === null) throw new Error('element has no box');
    if (
      previous !== null &&
      previous.x === box.x &&
      previous.y === box.y &&
      previous.width === box.width &&
      previous.height === box.height
    ) {
      return box;
    }
    previous = box;
    await locator.page().waitForTimeout(100);
  }
  throw new Error('element never stopped moving');
}

/** Saves a frame when LOADING_SHOT_DIR is set; the suite itself does not depend on the files. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.LOADING_SHOT_DIR;
  if (dir !== undefined) await page.screenshot({ path: `${dir}/${name}.png` });
}

/** Puts the fixture title in the library, so the loaded page has one row of data to land. */
async function seedLibrary(page: Page): Promise<void> {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();
  await waitForPingQuiet(page);
}

test('Given the local database is slow, When /library loads, Then the page chrome shows at once and only the rows wait, without moving', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);

  await observeLayoutShift(page);
  const gate = await holdLocalDatabase(page);
  await page.goto('/library', { waitUntil: 'domcontentloaded' });

  // --- Loading frame: the database has not opened, so nothing has been read yet.
  const title = page.getByRole('heading', { level: 1, name: 'Library' });
  const filters = page.getByRole('button', { name: /^Filters/ });
  const updates = page.getByRole('region', { name: 'Library updates' });
  const continueHeading = page.getByRole('heading', { level: 2, name: 'Continue reading' });
  const selectTitles = page.getByRole('button', { name: 'Select titles' });
  await expect(title).toBeVisible();
  await expect(filters).toBeVisible();
  await expect(updates).toBeVisible();
  await expect(continueHeading).toBeVisible();
  await expect(selectTitles).toBeDisabled();
  await expect(page.locator('[data-library-card]')).toHaveCount(0);
  await expect(page.getByText('0 titles')).toHaveCount(0);
  await expect(page.getByText('Browse providers')).toHaveCount(0);

  const shell = {
    title: await boxOf(title),
    filters: await boxOf(filters),
    updates: await boxOf(updates),
    continueHeading: await boxOf(continueHeading),
  };
  // Two full rows are rendered; the cells beyond the columns at this width are display:none.
  const placeholderCovers = page.locator('[data-library-loading] .aspect-3\\/4:visible');
  const placeholderFirst = await boxOf(placeholderCovers.first());
  const placeholderSecond = await boxOf(placeholderCovers.nth(1));
  const placeholderCount = await placeholderCovers.count();
  await shot(page, 'library.loading');

  // --- Loaded frame.
  gate.release();
  const card = page.locator('[data-library-card]').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('1 title')).toBeVisible();
  await expect(page.locator('[data-library-loading]')).toHaveCount(0);
  await page.waitForTimeout(1_000);
  await shot(page, 'library.loaded');

  await expect(selectTitles).toBeEnabled();

  // The chrome stayed where it was drawn.
  const after = {
    title: await boxOf(title),
    filters: await boxOf(filters),
    updates: await boxOf(updates),
    continueHeading: await boxOf(continueHeading),
  };
  // Everything down to the first shelf heading is static chrome. What sits under the shelves
  // moves with the shelves' own length, which only the data knows (see the report).
  for (const key of ['title', 'filters', 'updates', 'continueHeading'] as const) {
    expect(Math.abs(after[key].y - shell[key].y), `${key} top`).toBeLessThanOrEqual(
      SHELL_TOLERANCE_PX,
    );
    expect(Math.abs(after[key].x - shell[key].x), `${key} left`).toBeLessThanOrEqual(
      SHELL_TOLERANCE_PX,
    );
    expect(Math.abs(after[key].height - shell[key].height), `${key} height`).toBeLessThanOrEqual(
      SHELL_TOLERANCE_PX,
    );
  }

  // The placeholder row sits in the columns the cards use, at the same 3:4 ratio.
  const loadedCard = await boxOf(card.locator('button').first());
  expect(placeholderCount).toBe(8);
  expect(Math.abs(loadedCard.x - placeholderFirst.x)).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);
  expect(Math.abs(loadedCard.width - placeholderFirst.width)).toBeLessThanOrEqual(
    SHELL_TOLERANCE_PX,
  );
  expect(Math.abs(loadedCard.height - placeholderFirst.height)).toBeLessThanOrEqual(
    SHELL_TOLERANCE_PX,
  );
  // Column pitch is card width plus the 16px gap, so every placeholder column lines up too.
  expect(
    Math.abs(placeholderSecond.x - placeholderFirst.x - (loadedCard.width + 16)),
  ).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);

  // Whole-page shift between the first paint and settle. The shelves under the toolbar are
  // data-dependent (this fixture has an empty "Continue reading", a one-row "Recently updated"),
  // so the rows below them can move; "good" CLS is the budget there, 0.02 for the static pages.
  const shifts = await readShifts(page);
  test.info().annotations.push({ type: 'library-cls', description: String(sumShifts(shifts)) });
  expect(sumShifts(shifts), JSON.stringify(shifts)).toBeLessThanOrEqual(LIBRARY_CLS_BUDGET);

  await gate.dispose();
});

interface ShellRoute {
  readonly path: string;
  readonly heading: string;
  readonly section: string;
}

const SHELL_ROUTES: readonly ShellRoute[] = [
  { path: '/settings/app', heading: 'App settings', section: 'App settings' },
  { path: '/settings/reader', heading: 'Reader settings', section: 'Reader settings' },
  { path: '/backup', heading: 'Backup & Restore', section: 'Backup and restore' },
  { path: '/storage', heading: 'Storage', section: 'Storage' },
  { path: '/advanced/diagnostics', heading: 'Diagnostics', section: 'Diagnostics' },
  { path: '/advanced/migration', heading: 'Migration', section: 'Migration' },
];

for (const route of SHELL_ROUTES) {
  test(`Given the local database is slow, When ${route.path} loads, Then its header shows at once and neither the header nor the first section moves`, async ({
    page,
    quickOnboarding,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await observeLayoutShift(page);
    const gate = await holdLocalDatabase(page);
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });

    const heading = page.getByRole('heading', { level: 1, name: route.heading });
    await expect(heading).toBeVisible();
    // The first card under the header: a placeholder now, the real section after.
    const firstCard = page.locator(`section[aria-label="${route.section}"] .rounded-box`).first();
    await expect(page.locator('main .animate-pulse').first()).toBeVisible();
    const header = await boxOf(heading);
    const first = await boxOf(firstCard);
    await shot(page, `${route.path.replaceAll('/', '_')}.loading`);

    gate.release();
    await expect(page.locator('main .animate-pulse')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await shot(page, `${route.path.replaceAll('/', '_')}.loaded`);

    const headerAfter = await boxOf(heading);
    const firstAfter = await boxOf(firstCard);
    expect(Math.abs(headerAfter.y - header.y)).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);
    expect(Math.abs(headerAfter.x - header.x)).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);
    // The first section starts where its placeholder started, and is as wide.
    expect(Math.abs(firstAfter.y - first.y)).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);
    expect(Math.abs(firstAfter.x - first.x)).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);
    expect(Math.abs(firstAfter.width - first.width)).toBeLessThanOrEqual(SHELL_TOLERANCE_PX);

    expect(sumShifts(await readShifts(page))).toBeLessThanOrEqual(CLS_BUDGET);
    await gate.dispose();
  });
}

test('Given a route chunk is slow, When the router shows its pending component, Then the shell stays and no card grid is painted for the page that has not loaded', async ({
  page,
  quickOnboarding,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/discover');
  await expect(page.getByRole('heading', { level: 1, name: 'Discover' })).toBeVisible();

  // Hold the library's code, not its data: the router can only show its pending component.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/library-*.js', async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole('link', { name: 'Library' }).click();
  // Past the router's pending threshold, so the pending component is on screen.
  await page.waitForTimeout(1_600);
  await shot(page, 'route-pending');

  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  // The pending region has no box of its own (it is empty on purpose), so it is attached, not visible.
  await expect(page.getByRole('status', { name: 'Loading page' })).toBeAttached();
  // A library-shaped card grid here would be wrong for every route that is not the library.
  // (Suspense keeps the outgoing page in the DOM with display:none, so only visible nodes count.)
  await expect(page.locator('main .animate-pulse:visible')).toHaveCount(0);
  await expect(page.locator('main .aspect-3\\/4:visible')).toHaveCount(0);

  release();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('status', { name: 'Loading page' })).toHaveCount(0);
});
