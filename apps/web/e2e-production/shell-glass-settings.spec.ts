import { expect } from '@playwright/test';

import { test, reloadDurable, stubCapableHardware } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

test('Given Reduced transparency, When enabled, Then shell glass resolves solid and stays saved', async ({
  page,
  quickOnboarding,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await stubCapableHardware(page);
  await page.goto('/settings/app');

  const transparency = page.getByRole('switch', { name: 'Transparency' });
  await expect(transparency).toBeVisible();
  await expect(transparency).not.toBeChecked();
  await transparency.click();

  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'solid');
  await expect(page.locator('[data-ambient-backdrop]')).toHaveCount(1);
  await expect(page.locator('[data-ambient-backdrop]')).toHaveCSS('display', 'none');
  const stageFilter = await page.evaluate(() => {
    const stage = document.createElement('div');
    stage.className = 'glass-stage';
    document.body.append(stage);
    const filter = getComputedStyle(stage).backdropFilter;
    stage.remove();
    return filter;
  });
  expect(stageFilter).toBe('none');

  await reloadDurable(page);
  await expect(page.getByRole('switch', { name: 'Transparency' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-transparency', 'solid');

  await page.getByRole('switch', { name: 'Transparency' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-transparency');
  await expect(page.locator('[data-ambient-backdrop]')).toHaveCSS('display', 'block');
});

test('Given Reduced motion, When enabled, Then the app stays reduced across OS changes and reloads', async ({
  page,
  quickOnboarding,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await stubCapableHardware(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'full');
  await page.goto('/settings/app');

  const motion = page.getByRole('switch', { name: 'Motion' });
  await expect(motion).not.toBeChecked();
  await motion.click();
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'cheap');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'cheap');

  await reloadDurable(page);
  await expect(page.getByRole('switch', { name: 'Motion' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'cheap');
});

test('Given a four-core device, When the shell resolves its glass profile, Then glass is cheap', async ({
  page,
  quickOnboarding,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 4 });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
  });
  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-glass', 'cheap');
});

test('Given the OS requests reduced motion, When the preference changes, Then shell glass becomes cheap', async ({
  page,
  quickOnboarding,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await stubCapableHardware(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'full');
  await expect(page.locator('[data-ambient-backdrop]')).toHaveCSS('display', 'block');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-glass', 'cheap');
  await expect(page.locator('[data-ambient-backdrop]')).toHaveCSS('display', 'none');
});
