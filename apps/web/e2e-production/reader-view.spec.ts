import { expect, type Locator, type Page } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const CHAPTER_BUTTON = /Ch\. 1 - The Summoner/;
/** Chrome insets the reader reserves for its own controls (see ReaderScreen). */
const CHROME_TOP = 96;
const CHROME_BOTTOM = 48;

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

async function openSettings(page: Page) {
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

/** Parses the inline `translate(Xpx, Ypx) scale(S)` the zoom layer renders. */
function parseTransform(style: string | null): { scale: number; x: number; y: number } {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(style ?? '');
  if (match === null) return { scale: 1, x: 0, y: 0 };
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

async function zoomState(layer: Locator) {
  return parseTransform(await layer.getAttribute('style'));
}

test('Given the paged reader, When each fit mode is selected, Then the rendered page box changes and the control matches', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  const surfaceBox = (await page.getByTestId('reader-surface').boundingBox())!;
  const availableWidth = Math.round(surfaceBox.width);
  const availableHeight = Math.round(surfaceBox.height) - CHROME_TOP - CHROME_BOTTOM;

  const pageBox = page.getByTestId('reader-page-box').first();
  const sizeOf = async () => {
    const rect = (await pageBox.boundingBox())!;
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  };

  // The page image reports no intrinsic size, so original falls back to the
  // contain box but must still render the image at its natural size.
  const natural = await page
    .getByTestId('reader-surface')
    .locator('img')
    .first()
    .evaluate((image) => ({
      width: (image as HTMLImageElement).naturalWidth,
      height: (image as HTMLImageElement).naturalHeight,
    }));

  const dialog = await openSettings(page);
  const rendered: string[] = [];

  const matches: Record<string, (size: { width: number; height: number }) => boolean> = {
    width: (size) => size.width === availableWidth,
    height: (size) => size.height === availableHeight,
    contain: (size) => size.width <= availableWidth && size.height <= availableHeight,
    cover: (size) => size.width === availableWidth && size.height === availableHeight,
    original: (size) => size.width <= availableWidth && size.height <= availableHeight,
  };
  const objectFit: Record<string, string> = {
    width: 'contain',
    height: 'contain',
    contain: 'contain',
    cover: 'cover',
    original: 'none',
  };

  for (const fit of FIT_MODES) {
    const button = dialog.getByRole('button', { name: fit.name });
    await button.click();
    // The control matches what renders: aria-pressed flips only after the
    // optimistic settings write lands and the reader re-renders.
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(pageBox).toHaveAttribute('data-fit-mode', fit.value);
    await expect(pageBox).toHaveAttribute('data-object-fit', objectFit[fit.value]!);
    const size = await sizeOf();
    expect(matches[fit.value]!(size), `${fit.name} rendered ${size.width}x${size.height}`).toBe(
      true,
    );
    rendered.push(`${size.width}x${size.height}`);
  }

  // Width, height and cover each produce their own geometry.
  expect(new Set(rendered).size).toBeGreaterThanOrEqual(3);

  // Original size never upscales: the computed object-fit is `none`, so the
  // image paints at its intrinsic size inside the box instead of being scaled.
  const original = dialog.getByRole('button', { name: 'Original size' });
  await original.click();
  await expect(pageBox).toHaveAttribute('data-object-fit', 'none');
  const image = page.getByTestId('reader-surface').locator('img').first();
  await expect
    .poll(async () => image.evaluate((node) => getComputedStyle(node).objectFit))
    .toBe('none');
  // A natural 1x1 source proves the box is not the rendered image size.
  expect(natural.width).toBeLessThanOrEqual(1);
});

test('Given the paged reader at scale 1, When double-clicking, Then it zooms to doubleTapZoom and a drag pans within bounds', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  const layer = page.getByTestId('reader-zoom-layer');
  const box = (await page.getByTestId('reader-surface').boundingBox())!;

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await zoomState(layer)).scale).toBeGreaterThan(1);

  const zoomed = await zoomState(layer);
  expect(zoomed.scale).toBeLessThanOrEqual(3);

  // A drag longer than the widest allowed pan (surface width * (scale - 1))
  // must stop at the content edge instead of following the pointer off-screen.
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  const panned = await zoomState(layer);
  expect(panned.scale).toBe(zoomed.scale);
  expect(panned.x).toBeLessThanOrEqual(0);
  expect(panned.y).toBeLessThanOrEqual(0);
  // Clamped to the scaled content's edges.
  expect(panned.x).toBeGreaterThanOrEqual(-Math.round(box.width * (panned.scale - 1)) - 1);
  expect(panned.y).toBeGreaterThanOrEqual(-Math.round(box.height * (panned.scale - 1)) - 1);

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await zoomState(layer)).scale).toBe(1);
});

test('Given a zoomed page, When the page changes, Then the zoom resets to scale 1', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  const layer = page.getByTestId('reader-zoom-layer');
  const box = (await page.getByTestId('reader-surface').boundingBox())!;

  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await zoomState(layer)).scale).toBeGreaterThan(1);

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 / 37')).toBeVisible();
  await expect.poll(async () => (await zoomState(layer)).scale).toBe(1);
});

test('Given the vertical strip, When Home and End are pressed, Then the first and last page become active', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await switchToVertical(page);

  await page.keyboard.press('End');
  await expect(page.getByText('37 / 37')).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Home');
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('End');
  await expect(page.getByText('37 / 37')).toBeVisible({ timeout: 20_000 });
});

test('Given the vertical strip, When the current page is shorter than half the viewport, Then one ArrowRight advances exactly one page', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await switchToVertical(page);
  const strip = page.getByTestId('reader-scroll-view');

  // Shrink pages 11 and 12 to slivers and centre page 11. With a top-edge
  // scroll, ArrowRight lands on page 12's top while the viewport centre stays
  // in page 13, so the strip skips page 12 entirely (#474).
  await strip.evaluate((element) => {
    for (const index of [10, 11]) {
      const target = element.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
      if (target === null) continue;
      target.style.aspectRatio = 'auto';
      target.style.height = '120px';
    }
    const current = element.querySelector<HTMLElement>('[data-page-index="10"]');
    if (current === null) return;
    element.scrollTop = current.offsetTop - (element.clientHeight - current.offsetHeight) / 2;
  });
  await expect(page.getByText('11 / 37')).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('12 / 37')).toBeVisible({ timeout: 10_000 });
});

test('Given the vertical strip, When ArrowRight is pressed five times rapidly, Then the page advances exactly five', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await switchToVertical(page);
  const strip = page.getByTestId('reader-scroll-view');

  await strip.evaluate((element) => {
    const target = element.querySelector<HTMLElement>('[data-page-index="9"]');
    if (target !== null) {
      element.scrollTop = target.offsetTop;
    }
  });
  await expect(page.getByText('10 / 37')).toBeVisible({ timeout: 10_000 });

  for (let press = 0; press < 5; press += 1) {
    await page.keyboard.press('ArrowRight');
  }

  await expect(page.getByText('15 / 37')).toBeVisible({ timeout: 15_000 });
});
