import { expect, type Page } from '@playwright/test';

/**
 * Reader controls start hidden (spec R8). Show them with a tap on the reading
 * surface before a spec clicks a chrome control; a no-op when already visible,
 * so it may be called after every entry or reload. An error alert can cover the
 * surface centre, so the reader's own toggle shortcut is the fallback.
 */
export async function showReaderControls(page: Page): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Reader controls' });
  if ((await toolbar.count()) === 0) {
    if ((await page.getByRole('alert').count()) === 0) {
      const surface = page.getByTestId('reader-surface');
      const box = await surface.boundingBox();
      if (box !== null) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    if ((await toolbar.count()) === 0) await page.keyboard.press('h');
  }
  await expect(toolbar).toBeVisible();
}
