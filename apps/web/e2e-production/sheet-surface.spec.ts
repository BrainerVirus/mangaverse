import { expect } from '@playwright/test';
import { MANGADEX_APP_MANGA_ID, showReaderControls, test } from './helpers.js';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 900, height: 700 },
  { width: 390, height: 844 },
  { width: 1440, height: 480 },
  { width: 1440, height: 1600 },
]) {
  test(`reader sheet paints all visible controls at ${viewport.width}x${viewport.height}`, async ({
    page,
    quickOnboarding,
    mockMangaDex,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
    await page.getByRole('button', { name: /Ch\. 1 - The Summoner/ }).click();
    await expect(page.getByText('1 / 37')).toBeVisible({ timeout: 30_000 });
    await showReaderControls(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Reader settings' });
    await expect(sheet).toBeVisible();
    if (viewport.width === 900) {
      await page.evaluate(() => {
        document.documentElement.dataset.transparency = 'solid';
      });
      await expect(sheet.locator('[data-glass-tier="thick"]')).toHaveCSS('backdrop-filter', 'none');
    }
    for (const fraction of [0, 0.5, 1]) {
      await sheet.evaluate((el, position) => {
        el.scrollTop = (el.scrollHeight - el.clientHeight) * position;
      }, fraction);
      const close = sheet.getByRole('button', { name: 'Close', exact: true });
      const closeGeometry = await close.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return { top: rect.top, bottom: rect.bottom, hit: hit !== null && button.contains(hit) };
      });
      expect(closeGeometry.top).toBeGreaterThanOrEqual(0);
      expect(closeGeometry.bottom).toBeLessThanOrEqual(viewport.height);
      expect(closeGeometry.hit).toBe(true);
      await close.click({ trial: true });
      const geometry = await sheet.evaluate((el) => {
        const surface = el.querySelector<HTMLElement>('[data-glass-tier="thick"]')!;
        const bounds = surface.getBoundingClientRect();
        const viewport = el.getBoundingClientRect();
        const controls = [...el.querySelectorAll<HTMLElement>('fieldset, input, button')]
          .filter((node) => surface.contains(node))
          .map((node) => node.getBoundingClientRect())
          .filter((rect) => rect.bottom > viewport.top && rect.top < viewport.bottom);
        return {
          surfaceTop: bounds.top,
          surfaceBottom: bounds.bottom,
          controls: controls.map((rect) => ({
            top: Math.max(rect.top, viewport.top),
            bottom: Math.min(rect.bottom, viewport.bottom),
          })),
        };
      });
      expect(geometry.controls.length).toBeGreaterThan(0);
      for (const control of geometry.controls) {
        expect(geometry.surfaceTop).toBeLessThanOrEqual(control.top + 1);
        expect(geometry.surfaceBottom).toBeGreaterThanOrEqual(control.bottom - 1);
      }
      await page.screenshot({ path: testInfo.outputPath(`reader-${fraction}.png`) });
    }
    const padding = await sheet.evaluate((el) => {
      const last = [...el.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Reset title settings'),
      )!;
      return el.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
    });
    expect(padding).toBeGreaterThanOrEqual(23);
    if (viewport.height === 480) {
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(sheet).toBeHidden();
  });
}

test('mobile More and library filters retain their sheet surface and close controls', async ({
  page,
  quickOnboarding,
  mockMangaDex,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({
    content: '[role="dialog"] .safe-area-bottom { padding-bottom: 32px; }',
  });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const more = page.getByRole('dialog', { name: 'More' });
  await expect(more.getByRole('link').first()).toBeVisible();
  await expect(more.locator('[data-glass-tier="thick"]')).toBeVisible();
  const morePadding = await more.evaluate((el) => {
    const surface = el.querySelector<HTMLElement>('[data-glass-tier="thick"]')!;
    const last = [...surface.querySelectorAll('a')].at(-1)!;
    return surface.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
  });
  expect(morePadding).toBeGreaterThanOrEqual(55);
  await page.screenshot({ path: testInfo.outputPath('mobile-more.png') });
  await more.getByRole('button', { name: 'Close' }).click();
  await expect(more).toBeHidden();

  await page.goto(`/manga/${MANGADEX_APP_MANGA_ID}`);
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();
  await page.goto('/library');
  await page.getByRole('button', { name: /filters/i }).click();
  const filters = page.getByRole('dialog', { name: 'Filters' });
  await expect(filters.getByRole('combobox', { name: 'Filter by status' })).toBeVisible();
  await expect(filters.locator('[data-glass-tier="thick"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('library-filters.png') });
  await page.keyboard.press('Escape');
  await expect(filters).toBeHidden();
});

test('design system dialog opens and closes without changing its surface', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/design-system');
  await page.getByTestId('dialog-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'A focused decision' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-glass-tier="thick"]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();
});
