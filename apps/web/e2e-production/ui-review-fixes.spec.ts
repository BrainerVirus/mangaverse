import { readFile } from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, openCommandPalette, test, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 240_000 });

const TITLE = 'Kuro no Shoukanshi';

interface BackupDocument {
  mangaIdentities: Array<Record<string, unknown>>;
  library: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Adds one title, exports a backup, and clones it into a library of `count` titles. */
async function seedLibrary(page: Page, count: number): Promise<void> {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('In library')).toBeVisible();
  await waitForPingQuiet(page);

  await page.goto('/backup');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).last().click();
  const exported = JSON.parse(
    await readFile(await (await download).path(), 'utf8'),
  ) as BackupDocument;

  const baseManga = exported.mangaIdentities[0]!;
  const baseMapping = (baseManga['providerMappings'] as Array<Record<string, unknown>>)[0]!;
  const baseEntry = exported.library[0]!;

  for (let index = 0; index < count; index += 1) {
    const mangaId = `seed-manga-${index}`;
    const mappingId = `seed-map-${index}`;
    exported.mangaIdentities.push({
      ...baseManga,
      id: mangaId,
      canonicalTitle: `Seed Title ${String(index + 1).padStart(2, '0')}`,
      providerMappings: [{ ...baseMapping, id: mappingId, providerMangaId: `seed-${index}` }],
      defaultProviderMappingId: mappingId,
    });
    exported.library.push({ ...baseEntry, id: `seed-entry-${index}`, mangaId });
  }

  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'seed-library.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByText('Valid backup')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('Restore complete')).toBeVisible({ timeout: 30_000 });
}

interface GridGeometry {
  scrollTop: number;
  sectionTop: number;
  expectedIndex: number;
  actualIndex: number;
  firstRowTop: number;
  firstCardVisible: boolean;
  rowHeight: number;
}

/** Measures which virtual row sits under the viewport's top edge. */
async function measureGrid(page: Page): Promise<GridGeometry> {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement;
    const section = document.querySelector('[aria-label="Library titles"]') as HTMLElement;
    const rows = [...section.querySelectorAll<HTMLElement>('[data-index]')];
    const rowTops = rows.map((row) => ({
      index: Number(row.dataset['index']),
      top: row.getBoundingClientRect().top,
    }));
    rowTops.sort((a, b) => a.top - b.top);

    const viewportTop = main.getBoundingClientRect().top;
    const covering = rowTops.find((row, index) => {
      const next = rowTops[index + 1];
      return row.top <= viewportTop + 1 && (next === undefined || next.top > viewportTop);
    });

    const firstRow = section.querySelector<HTMLElement>('[data-index="0"]');
    const firstCard = section.querySelector<HTMLElement>('[data-library-card]');
    const rowHeight =
      rows.length > 1
        ? Math.abs((rowTops[1]?.top ?? 0) - (rowTops[0]?.top ?? 0))
        : (rows[0]?.getBoundingClientRect().height ?? 1);

    const sectionAbsTop = section.getBoundingClientRect().top + main.scrollTop;

    return {
      scrollTop: main.scrollTop,
      sectionTop: sectionAbsTop,
      expectedIndex: Math.max(0, Math.floor((main.scrollTop - sectionAbsTop) / rowHeight)),
      actualIndex: covering?.index ?? -1,
      firstRowTop: firstRow?.getBoundingClientRect().top ?? Number.NaN,
      firstCardVisible:
        firstCard !== null &&
        firstCard.getBoundingClientRect().top < window.innerHeight &&
        firstCard.getBoundingClientRect().bottom > viewportTop,
      rowHeight,
    };
  });
}

async function scrollToGridTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement;
    const section = document.querySelector('[aria-label="Library titles"]') as HTMLElement;
    main.scrollTop += section.getBoundingClientRect().top - main.getBoundingClientRect().top;
  });
  await page.waitForTimeout(150);
}

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const) {
  test(`Given a long library, When the page is wheel-scrolled at ${viewport.width}, Then the visible rows match the scroll position`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page).toHaveURL(/\/library/);
    await seedLibrary(page, 46);

    await page.goto('/library');
    await expect(page.locator('[data-library-card]').first()).toBeVisible({ timeout: 30_000 });

    for (const layout of ['List', 'Compact'] as const) {
      await page.getByRole('button', { name: layout, exact: true }).click();
      await expect(
        page.locator('[aria-label="Library titles"] [data-index]').first(),
      ).toBeVisible();

      await scrollToGridTop(page);
      const atTop = await measureGrid(page);
      // The first row is on screen at the grid's own top: the bug left the top
      // of the grid blank because the virtualizer counted from the page top.
      expect(atTop.firstCardVisible).toBe(true);
      expect(atTop.actualIndex).toBeLessThanOrEqual(1);

      const main = page.locator('main');
      const box = await main.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(250);

      const scrolled = await measureGrid(page);
      expect(scrolled.scrollTop).toBeGreaterThan(atTop.scrollTop + 500);
      // The row under the top edge is the row the scroll offset points at, not
      // one displaced by the distance from the page top to the grid.
      expect(Math.abs(scrolled.actualIndex - scrolled.expectedIndex)).toBeLessThanOrEqual(1);
      expect(scrolled.firstCardVisible).toBe(false);

      // Entering selection mode inserts the bulk bar above the grid: the offset
      // changes without either box resizing, so the next scroll must re-measure.
      await page.getByRole('button', { name: 'Select titles' }).click();
      const bulkEdit = page.getByRole('region', { name: 'Bulk edit' });
      await expect(bulkEdit).toBeVisible();
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(150);
      const withBulkBar = await measureGrid(page);
      expect(Math.abs(withBulkBar.actualIndex - withBulkBar.expectedIndex)).toBeLessThanOrEqual(1);

      await page.keyboard.press('Escape');
      await expect(bulkEdit).toBeHidden();
    }
  });
}

test('Given a failing durable write, When the banner shows at 390 and 1440, Then it sits below the header and Retry is reachable', async ({
  page,
  quickOnboarding,
}) => {
  await page.addInitScript(() => {
    // oxlint-disable-next-line typescript/unbound-method -- the native method is re-invoked with its original receiver below
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode) {
      if (mode === 'readwrite' && String(stores).includes('snapshots')) {
        throw new DOMException('simulated quota', 'QuotaExceededError');
      }
      return original.call(this, stores, mode);
    } as typeof IDBDatabase.prototype.transaction;
  });
  // The init script only applies to a new document; reload so writes fail from
  // here on, while the profile that finished onboarding stays in place.
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.goto('/settings/app');
  const motion = page.getByRole('switch', { name: 'Motion' });
  await expect(motion).toBeVisible({ timeout: 30_000 });
  await motion.click();

  const banner = page.getByRole('alert').filter({ hasText: 'Saving locally failed' });
  await expect(banner).toBeVisible({ timeout: 15_000 });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ] as const) {
    await page.setViewportSize(viewport);
    // A sticky notice sits above the content at rest; scrolling under it is the
    // point of sticky, so measure the rest state the review screenshotted.
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main !== null) main.scrollTop = 0;
    });
    await expect(banner).toBeVisible();

    const geometry = await page.evaluate(() => {
      const alert = [...document.querySelectorAll('[role="alert"]')].find((element) =>
        element.textContent?.includes('Saving locally failed'),
      ) as HTMLElement | undefined;
      const notices = document.querySelector('[data-app-notices]') as HTMLElement | null;
      const heading = document.querySelector('h1') as HTMLElement | null;
      const retry = [...(alert?.querySelectorAll('button') ?? [])].find(
        (button) => button.textContent === 'Retry',
      ) as HTMLButtonElement | undefined;
      const description = alert?.querySelector('[data-alert-description]') as HTMLElement | null;
      const rect = alert?.getBoundingClientRect();
      const retryRect = retry?.getBoundingClientRect();
      return {
        inNotices: notices !== null && notices.contains(alert ?? null),
        alertBottom: rect?.bottom ?? Number.NaN,
        headingTop: heading?.getBoundingClientRect().top ?? Number.NaN,
        retryVisible:
          retryRect !== undefined &&
          retryRect.top >= 0 &&
          retryRect.bottom <= window.innerHeight &&
          retryRect.width > 0,
        alertWidth: rect?.width ?? 0,
        viewportWidth: window.innerWidth,
        descriptionFontSize:
          description === null ? 0 : Number.parseFloat(getComputedStyle(description).fontSize),
      };
    });

    expect(geometry.inNotices).toBe(true);
    // In flow above the content: the banner ends before the page heading starts.
    expect(geometry.alertBottom).toBeLessThanOrEqual(geometry.headingTop + 1);
    expect(geometry.retryVisible).toBe(true);
    expect(geometry.alertWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.descriptionFontSize).toBeGreaterThanOrEqual(12);
  }
});

test('Given the command palette, When it opens from the shortcut and the button, Then the input holds focus and typing works without clicking', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/library');
  const palette = await openCommandPalette(page);
  await expect(page.getByLabel('Search commands')).toBeFocused();
  // Typed, not filled: the field already has focus when the palette opens.
  await page.keyboard.type('settings');
  await expect(page.getByLabel('Search commands')).toHaveValue('settings');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Search commands')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  // The sidebar button path returns focus to the button that opened it.
  const opener = page.getByRole('button', { name: 'Open command palette' });
  await opener.click();
  await expect(page.getByLabel('Search commands')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Given the mobile More sheet, When Tab runs past the last item, Then focus stays inside and Escape restores the trigger', async ({
  page,
  quickOnboarding,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/library');

  const opener = page.getByRole('button', { name: 'Open navigation menu' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet).toBeVisible();

  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab');
    // Base UI enqueues its wrap on the next frame, so poll instead of sampling
    // the instant between the key and the focus guard.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            return dialog !== null && dialog.contains(document.activeElement);
          }),
        { timeout: 2_000 },
      )
      .toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});

test.describe('touch targets', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('Given a coarse pointer, Then a switch keeps its 44x24 track while real buttons keep the 44px floor', async ({
    page,
    quickOnboarding,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/settings/app');
    const motion = page.getByRole('switch', { name: 'Motion' });
    await expect(motion).toBeVisible({ timeout: 30_000 });

    const sizes = await page.evaluate(() => {
      const toggle = [...document.querySelectorAll<HTMLElement>('[role="switch"]')].find(
        (element) => element.getBoundingClientRect().height > 0,
      );
      const button = [...document.querySelectorAll<HTMLElement>('button')].find(
        (element) =>
          element.getAttribute('role') !== 'switch' &&
          element.getBoundingClientRect().height > 0 &&
          element.getBoundingClientRect().width > 0,
      );
      const toggleRect = toggle?.getBoundingClientRect();
      const buttonRect = button?.getBoundingClientRect();
      return {
        toggle: { width: toggleRect?.width ?? 0, height: toggleRect?.height ?? 0 },
        button: { width: buttonRect?.width ?? 0, height: buttonRect?.height ?? 0 },
      };
    });

    expect(sizes.toggle.height).toBeCloseTo(24, 0);
    expect(sizes.toggle.width).toBeCloseTo(44, 0);
    expect(sizes.button.height).toBeGreaterThanOrEqual(44);
  });
});

test('Given the install dialog, When its manifest field takes focus, Then the ring is not clipped by the scroll body', async ({
  page,
  quickOnboarding,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/extensions');
  await page.getByRole('button', { name: 'Install provider' }).first().click();

  const dialog = page.getByTestId('install-provider-dialog');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  const input = page.getByLabel('Manifest URL');
  await input.focus();

  const clearance = await page.evaluate(() => {
    const body = document.querySelector('[data-testid="install-provider-body"]') as HTMLElement;
    const field = body.querySelector('input') as HTMLElement;
    const bodyRect = body.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    return {
      top: fieldRect.top - bodyRect.top,
      left: fieldRect.left - bodyRect.left,
      right: bodyRect.right - fieldRect.right,
      padding: getComputedStyle(body).paddingTop,
    };
  });

  // 2px ring + 2px offset need at least 4px of clearance on every side.
  expect(clearance.top).toBeGreaterThanOrEqual(4);
  expect(clearance.left).toBeGreaterThanOrEqual(4);
  expect(clearance.right).toBeGreaterThanOrEqual(4);
});
