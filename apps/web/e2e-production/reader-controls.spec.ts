import { expect, type Page } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, stubCapableHardware, test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

async function openReader(page: Page) {
  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  const chapter = page.getByRole('button', { name: /Ch\. 1 - The Summoner/ });
  await expect(chapter).toBeVisible({ timeout: 30_000 });
  await chapter.click({ force: true });
  await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
}

test('Given an open chapter, When tapping the page edges, Then the page advances and returns', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  const surface = page.getByTestId('reader-surface');
  const box = (await surface.boundingBox())!;

  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await expect(page.getByText('2 / 37')).toBeVisible();

  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.5);
  await expect(page.getByText('1 / 37')).toBeVisible();
});

test('Given an open chapter, When changing settings, Then the layout changes and the page does not', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  // Page 1 is the cover (treatFirstPageAsCover), so it renders alone in double
  // layout too; advance to page 2 where a real spread exists.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('2 / 37')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reader settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-glass-tier="thick"]')).toBeVisible();
  // Focus moves into the sheet on open.
  await expect(dialog.getByRole('button', { name: 'Left to right' })).toBeFocused();

  const images = page.getByTestId('reader-surface').locator('img');
  const doubleButton = dialog.getByRole('button', { name: 'Double page' });
  const singleButton = dialog.getByRole('button', { name: 'Single page' });

  // aria-pressed flips only after the optimistic settings write lands and the
  // reader re-renders, so the count assertions below run against the settled
  // layout instead of a transient mid-transition frame.
  await doubleButton.click();
  await expect(doubleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(images).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText('2 / 37')).toBeVisible();

  await singleButton.click();
  await expect(singleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(images).toHaveCount(1, { timeout: 20_000 });
  // Using the settings controls must never leak into the tap zones and page.
  await expect(page.getByText('2 / 37')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Focus returns to the trigger.
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
});

test('Given an open chapter, When hovering and dragging the rail, Then a page preview follows and the page changes', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  await expect(page.locator('[data-glass-tier="stage"]')).toHaveCount(1);
  const rail = page.getByRole('slider', { name: 'Page slider' });
  const box = (await rail.boundingBox())!;

  // Hover: a preview popover with a rendered page image follows the pointer.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  const preview = page.getByTestId('reader-rail-preview');
  await expect(preview).toBeVisible();
  await expect(page.locator('[data-glass-tier="stage"]')).toHaveCount(2);
  await expect(preview.locator('img')).toBeVisible({ timeout: 20_000 });
  await expect(preview).toContainText('19');

  // Drag the thumb to the end: the page follows the pointer while dragging.
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/3[0-9] \/ 37/)).toBeVisible({ timeout: 20_000 });

  // The rail fill is proportional to the page the drag landed on.
  const indicator =
    (await page
      .getByText(/\d+ \/ 37/)
      .first()
      .textContent()) ?? '';
  const pageNumber = Number(indicator.match(/(\d+) \/ 37/)?.[1] ?? '0');
  const transform = await page.getByTestId('reader-rail-fill').evaluate((el) => el.style.transform);
  const scale = Number(transform.match(/scaleX\(([\d.]+)\)/)?.[1] ?? '-1');
  expect(Math.abs(scale - (pageNumber - 1) / 36)).toBeLessThan(0.02);

  // The thumb rides the same fraction through `left` (its translate only centers
  // it), so a thumb that stops tracking the page position fails here.
  const thumbLeft = await page.getByTestId('reader-rail-thumb').evaluate((el) => el.style.left);
  const thumbFraction = Number(thumbLeft.replace('%', '')) / 100;
  expect(Math.abs(thumbFraction - (pageNumber - 1) / 36)).toBeLessThan(0.02);
});

test('Given the mode switcher, When changing modes, Then the highlight morphs to the active option', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);

  const highlight = page
    .locator('[class*="rounded-full"][class*="bg-white"][class*="absolute"]')
    .first();
  const single = page.getByRole('button', { name: 'Single' });
  const double = page.getByRole('button', { name: 'Double' });

  await expect(highlight).toBeVisible();
  const singleBox = (await single.boundingBox())!;
  const before = (await highlight.boundingBox())!;
  expect(Math.abs(before.x - singleBox.x)).toBeLessThan(4);

  await double.click();
  await expect(double).toHaveText('Double');
  // Wait for the tween to settle, then the highlight sits over Double.
  await page.waitForTimeout(600);
  const doubleBox = (await double.boundingBox())!;
  const after = (await highlight.boundingBox())!;
  expect(Math.abs(after.x - doubleBox.x)).toBeLessThan(4);
  expect(Math.abs(after.width - doubleBox.width)).toBeLessThan(4);
});

test('Given an open chapter, When clicking Maximize, Then the document goes fullscreen', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);

  await page.getByRole('button', { name: 'Maximize' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('Given the reader chrome, When each control is clicked, Then the page does not advance', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await openReader(page);
  // Sit on a page that can move in either direction, so a click that leaks into
  // the tap zones is visible either way.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const indicator = page.getByText('3 / 37');
  await expect(indicator).toBeVisible();

  // The tap handler lives on the reader surface alone: a chrome control nested
  // inside it would receive that handler's clicks.
  expect(
    await page.evaluate(() => {
      const surface = document.querySelector('[data-testid="reader-surface"]');
      const chrome = document.querySelector('[role="toolbar"]');
      return surface !== null && chrome !== null && surface.contains(chrome);
    }),
  ).toBe(false);

  const toolbar = page.getByRole('toolbar', { name: 'Reader controls' });
  const chromeStillOpen = async () => {
    // A leaked tap would also toggle the chrome away (pointer-events: none).
    await expect(toolbar).toHaveCSS('pointer-events', 'auto');
    await expect(indicator).toHaveText('3 / 37');
  };

  await toolbar.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toBeVisible();
  // The open dialog hides the chrome from the accessibility tree, so the
  // isolation is asserted once the sheet is closed again.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toBeHidden();
  await chromeStillOpen();

  await toolbar.getByRole('button', { name: 'Maximize' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await chromeStillOpen();
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

  await toolbar.getByRole('button', { name: 'Double' }).click();
  await chromeStillOpen();
  await toolbar.getByRole('button', { name: 'Single' }).click();
  await chromeStillOpen();

  // The chrome's own text is not a control and must not be a tap either.
  await toolbar.locator('span').first().click();
  await chromeStillOpen();
});

test('Given reader glass, When transparency is reduced, Then glass layers resolve opaque', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}) => {
  await stubCapableHardware(page);
  await openReader(page);
  const stage = page.locator('[data-testid="reader-chrome-stage"]');

  await expect(stage).toBeVisible();
  await expect
    .poll(() => stage.evaluate((element) => getComputedStyle(element).backdropFilter))
    .not.toBe('none');

  await page.evaluate(() => document.documentElement.setAttribute('data-transparency', 'solid'));
  await expect
    .poll(() => stage.evaluate((element) => getComputedStyle(element).backdropFilter))
    .toBe('none');
  await expect
    .poll(() => stage.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgba(0, 0, 0, 0.88)');
});
