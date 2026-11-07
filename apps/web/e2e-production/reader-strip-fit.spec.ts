import { expect, type Page } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, showReaderControls, test } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
/** The served page is 800x1200, so every expected box below derives from 2:3. */
const PAGE_RATIO = 2 / 3;

const VIEWPORTS = [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 },
] as const;

const FIT_MODES = [
  { name: 'Fit width', value: 'width' },
  { name: 'Fit height', value: 'height' },
  { name: 'Fit screen', value: 'contain' },
  { name: 'Fill screen', value: 'cover' },
  { name: 'Original size', value: 'original' },
] as const;

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: CHAPTER_BUTTON });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

/** A portrait source, so the strip's row ratio is the served page's own. */
async function servePortraitPages(page: Page) {
  await page.route('**/*.mangadex.network/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="white"/></svg>',
    }),
  );
}

async function openSettings(page: Page) {
  await showReaderControls(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function switchToVertical(page: Page) {
  const dialog = await openSettings(page);
  const vertical = dialog.getByRole('button', { name: 'Vertical scroll' });
  await vertical.click();
  await expect(vertical).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reader-scroll-view')).toBeVisible({ timeout: 20_000 });
}

/** Chooses a strip fit in the settings sheet and waits until it is the live value. */
async function chooseFit(page: Page, name: string) {
  const dialog = await openSettings(page);
  const button = dialog.getByRole('button', { name, exact: true });
  await button.click();
  // The optimistic write must round-trip before the reader re-renders the rows.
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

for (const viewport of VIEWPORTS) {
  test(`Given the vertical strip at ${viewport.label} width, When each fit mode is chosen, Then the row follows the documented fit semantics`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await servePortraitPages(page);
    await openReader(page);
    await switchToVertical(page);

    const strip = page.getByTestId('reader-scroll-view');
    const row = page.locator('[data-page-index="0"]');
    await expect(row).toBeVisible();

    const stripBox = await strip.evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    }));
    // Auto bounds the strip on desktop and fills the width under 1024px.
    const column = stripBox.width * (stripBox.width >= 1024 ? 0.7 : 1);
    const heightBox = stripBox.height * PAGE_RATIO;

    const expected: Record<
      (typeof FIT_MODES)[number]['value'],
      { width: number; height: number; objectFit: string }
    > = {
      width: { width: column, height: column / PAGE_RATIO, objectFit: 'contain' },
      height: {
        width: stripBox.height * PAGE_RATIO,
        height: stripBox.height,
        objectFit: 'contain',
      },
      contain: {
        width: Math.min(column, heightBox),
        height: Math.min(column, heightBox) / PAGE_RATIO,
        objectFit: 'contain',
      },
      cover: { width: column, height: stripBox.height, objectFit: 'cover' },
      original: { width: 800, height: 1200, objectFit: 'none' },
    };

    const rendered: string[] = [];
    for (const fit of FIT_MODES) {
      await chooseFit(page, fit.name);
      await expect(row).toHaveAttribute('data-object-fit', expected[fit.value].objectFit);

      const rect = await row.boundingBox();
      if (rect === null) throw new Error(`${fit.name} rendered no page row`);
      const size = { width: Math.round(rect.width), height: Math.round(rect.height) };
      // The row height is rounded to the pixel grid; allow that one pixel.
      expect(
        Math.abs(size.width - expected[fit.value].width),
        `${fit.name} width ${size.width} vs ${expected[fit.value].width}`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(size.height - expected[fit.value].height),
        `${fit.name} height ${size.height} vs ${expected[fit.value].height}`,
      ).toBeLessThanOrEqual(2);
      rendered.push(`${size.width}x${size.height}`);
    }

    // Explicit choices are not inert: width, height, cover and original each
    // render a distinct box for a portrait page.
    expect(new Set(rendered).size).toBeGreaterThanOrEqual(4);
  });
}
