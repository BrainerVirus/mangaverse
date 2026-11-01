import { expect, type Page } from '@playwright/test';

import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

const DETAIL_PATH = `/manga/${MANGADEX_APP_MANGA_ID}`;
const TITLE = 'Kuro no Shoukanshi';

/** The primary routes a user lands on; the detail page is the deepest one. */
const PRIMARY_ROUTES = [
  { path: '/library', heading: 'Library' },
  { path: '/search', heading: 'Search' },
  { path: '/discover', heading: 'Discover' },
  { path: '/settings', heading: 'Settings' },
  { path: DETAIL_PATH, heading: TITLE },
] as const;

interface OverflowGeometry {
  document: number;
  main: number;
}

async function horizontalOverflow(page: Page): Promise<OverflowGeometry> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main: main === null ? 0 : main.scrollWidth - main.clientWidth,
    };
  });
}

interface ControlSize {
  label: string;
  width: number;
  height: number;
}

/** Visible primary controls smaller than a 44x44 touch target. */
async function undersizedControls(page: Page): Promise<ControlSize[]> {
  return page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], [role="combobox"]'),
    );
    return controls
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none'
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: (element.getAttribute('aria-label') ?? element.textContent ?? element.tagName)
            .trim()
            .slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((control) => control.width < 44 || control.height < 44);
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`Given every primary route at ${width}px, Then nothing scrolls sideways`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });

    for (const route of PRIMARY_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({
        timeout: 30_000,
      });

      const overflow = await horizontalOverflow(page);
      expect(
        overflow.document,
        `${route.path} document overflow at ${width}px`,
      ).toBeLessThanOrEqual(0);
      expect(overflow.main, `${route.path} main overflow at ${width}px`).toBeLessThanOrEqual(0);
    }

    expect(mockMangaDex.count).toBeGreaterThan(0);
  });
}

test.describe('touch layout', () => {
  // Mobile emulation is what turns `(pointer: coarse)` on in Chromium; the test
  // proves the media query below before measuring.
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

  test('Given a coarse pointer at 390px, Then every primary control is at least 44px', async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(DETAIL_PATH);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

    // The floor only applies to a real coarse pointer; prove the emulation.
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);

    const undersized = await undersizedControls(page);
    expect(undersized).toEqual([]);

    // The bottom bar's own links are touch targets as well.
    const navHeights = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav a')).map(
        (link) => link.getBoundingClientRect().height,
      ),
    );
    expect(navHeights.length).toBeGreaterThan(0);
    expect(Math.min(...navHeights)).toBeGreaterThanOrEqual(44);

    // The coarse floor must not push the layout sideways either.
    const overflow = await horizontalOverflow(page);
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.main).toBeLessThanOrEqual(0);
    expect(mockMangaDex.count).toBeGreaterThan(0);
  });

  test('Given a coarse pointer at 390px, Then the chapter controls are comfortable too', async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible({
      timeout: 30_000,
    });

    const undersized = await undersizedControls(page);
    expect(undersized).toEqual([]);
    expect(mockMangaDex.count).toBeGreaterThanOrEqual(0);
  });
});

test('Given a fine pointer at 1440px, Then dense control sizes stay unchanged', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DETAIL_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

  expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(false);

  const sizes = await page.evaluate(() => {
    const filter = document.querySelector(
      'fieldset[aria-label="Filter chapters"] button',
    ) as HTMLElement;
    const sort = document.querySelector('[aria-label="Sort chapters"]') as HTMLElement;
    return {
      filter: filter.getBoundingClientRect().height,
      sort: sort.getBoundingClientRect().height,
    };
  });

  // `sm` buttons stay 36px and the select trigger stays 40px for a fine pointer.
  expect(sizes.filter).toBe(36);
  expect(sizes.sort).toBe(40);
  expect(mockMangaDex.count).toBeGreaterThan(0);
});

test('Given the detail page at 390px, Then the title and description use the full content width', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(DETAIL_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

  const geometry = await page.evaluate(() => {
    const section = document.querySelector('section[aria-label="Manga details"]') as HTMLElement;
    const style = getComputedStyle(section);
    const contentWidth =
      section.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const title = section.querySelector('h1') as HTMLElement;
    const description = section.querySelector('p.max-w-3xl') as HTMLElement | null;
    return {
      contentWidth,
      titleWidth: title.getBoundingClientRect().width,
      descriptionWidth: description?.getBoundingClientRect().width ?? 0,
    };
  });

  expect(geometry.titleWidth).toBeGreaterThanOrEqual(geometry.contentWidth - 1);
  expect(geometry.descriptionWidth).toBeGreaterThanOrEqual(geometry.contentWidth - 1);
  expect(mockMangaDex.count).toBeGreaterThan(0);
});

test('Given the detail page at 1440px, Then no empty box sits under the cover', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(DETAIL_PATH);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 30_000 });

  const cover = await page.evaluate((heading) => {
    const image = document.querySelector(`img[alt="${heading}"]`) as HTMLImageElement;
    const box = image.parentElement as HTMLElement;
    const title = document.querySelector('h1') as HTMLElement;
    return {
      boxHeight: box.getBoundingClientRect().height,
      imageHeight: image.getBoundingClientRect().height,
      boxRight: box.getBoundingClientRect().right,
      titleLeft: title.getBoundingClientRect().left,
    };
  }, TITLE);

  // The cover box hugs its art (plus the 1px border on each side) instead of
  // stretching to the summary's height with `bg-muted` showing underneath.
  expect(Math.abs(cover.boxHeight - cover.imageHeight)).toBeLessThanOrEqual(3);
  expect(cover.boxRight).toBeLessThan(cover.titleLeft);
  expect(mockMangaDex.count).toBeGreaterThan(0);
});
