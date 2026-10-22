import { expect, type Locator, type Page } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const RICH_MANIFEST_URL = 'https://manifest.audit.test/rich.json';

const richManifest = {
  id: 'audit-rich',
  name: 'Audit Rich Provider',
  version: '1.0.0',
  source: {
    // Deliberately long: at 390 px the preview must wrap it and scroll, not widen the dialog.
    url: `https://cdn.audit.test/${'very-long-source-segment/'.repeat(10)}provider`,
    publisher: 'Audit Studio',
  },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true, 'metadata.chapters': true },
  permissions: ['network.http', 'storage.local', 'storage.read', 'storage.write'],
  languages: ['en', 'ja'],
  contentFlags: { nsfw: true, suggestive: true, violence: true },
};

const LONG_NAME_MANIFEST_URL = 'https://manifest.audit.test/long-name.json';

const longNameManifest = {
  ...richManifest,
  id: 'audit-long-name',
  // One unbroken word wider than a tablet card: without min-w-0/truncate the card overflows.
  name: 'Audit Community Provider WithAnExcessivelyLongUnbrokenVendorIdentifierForTabletLayoutChecks',
};

async function openManifestPreview(
  page: Page,
  manifest: unknown,
  manifestUrl: string,
): Promise<Locator> {
  await page.route('https://manifest.audit.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(manifest),
    }),
  );

  await page.goto('/extensions?install=1');
  const dialog = page.getByRole('dialog', { name: 'Install provider' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByLabel('Manifest URL').fill(manifestUrl);
  await dialog.getByRole('button', { name: 'Review manifest' }).click();
  await expect(dialog.getByText('Mature content')).toBeVisible({ timeout: 20_000 });
  return dialog;
}

async function openRichPreview(page: Page): Promise<Locator> {
  return openManifestPreview(page, richManifest, RICH_MANIFEST_URL);
}

async function expectInsideViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function expectNoInternalOverflow(locator: Locator) {
  const metrics = await locator.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test.describe('install preview bounds at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Given a rich mobile manifest, Then the dialog fits the viewport, scrolls internally, and keeps Cancel reachable', async ({
    page,
    quickOnboarding,
  }) => {
    const dialog = await openRichPreview(page);

    await expect(dialog.getByText('Audit Studio')).toBeVisible();
    await expect(dialog.getByText('NSFW', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Yes', { exact: true })).toHaveCount(3);

    await expectInsideViewport(dialog, page);
    await expectInsideViewport(dialog.getByRole('heading', { name: 'Install provider' }), page);
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();
    await expectInsideViewport(cancel, page);

    const body = dialog.getByTestId('install-provider-body');
    const before = await body.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(cancel).toBeVisible();
    await expectInsideViewport(cancel, page);
  });
});

test.describe('install preview bounds on desktop', () => {
  test.use({ viewport: { width: 1280, height: 1024 } });

  test('Given a rich manifest, Then publisher and flags are shown and the dialog stays in the viewport', async ({
    page,
    quickOnboarding,
  }) => {
    const dialog = await openRichPreview(page);

    await expectInsideViewport(dialog, page);
    await expect(dialog.getByRole('heading', { name: 'Install provider' })).toBeVisible();
    await expect(dialog.getByText('Audit Studio')).toBeVisible();
    await expect(dialog.getByText('Yes', { exact: true })).toHaveCount(3);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirm install' })).toBeVisible();
  });
});

test.describe('shared dialog spacing', () => {
  test('Given the install dialog, Then header, body, and footer keep the shared gap', async ({
    page,
    quickOnboarding,
  }) => {
    const dialog = await openRichPreview(page);
    const surface = dialog
      .getByRole('heading', { name: 'Install provider' })
      .locator('xpath=../..');
    const header = dialog.getByRole('heading', { name: 'Install provider' }).locator('..');
    const body = dialog.getByTestId('install-provider-body');
    const footer = dialog.getByRole('button', { name: 'Cancel' }).locator('..');

    expect(await surface.evaluate((element) => getComputedStyle(element).rowGap)).toBe('16px');

    const [headerBox, bodyBox, footerBox] = await Promise.all([
      header.boundingBox(),
      body.boundingBox(),
      footer.boundingBox(),
    ]);
    expect(headerBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    if (headerBox === null || bodyBox === null || footerBox === null) return;
    expect(bodyBox.y - (headerBox.y + headerBox.height)).toBeGreaterThanOrEqual(15);
    expect(footerBox.y - (bodyBox.y + bodyBox.height)).toBeGreaterThanOrEqual(15);
  });

  test('Given the restore confirmation, Then it opens with the shared header, body, and footer gap', async ({
    page,
    quickOnboarding,
  }) => {
    await page.goto('/backup');
    const exportButton = page.getByRole('button', { name: 'Export backup', exact: true }).last();
    await expect(exportButton).toBeEnabled({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).not.toBeNull();

    await page.getByLabel('Choose backup file').setInputFiles(backupPath!);
    await expect(page.getByRole('button', { name: 'Restore backup' })).toBeEnabled({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Restore backup' }).click();

    const dialog = page.getByRole('dialog', { name: 'Replace local data?' });
    await expect(dialog).toBeVisible();
    const surface = dialog
      .getByRole('heading', { name: 'Replace local data?' })
      .locator('xpath=../..');
    expect(await surface.evaluate((element) => getComputedStyle(element).rowGap)).toBe('16px');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirm restore' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('tablet extension internal layout', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('Given an expanded rail at 768x1024, Then cards and content-flag tiles do not overflow their containers', async ({
    page,
    quickOnboarding,
  }) => {
    await page.goto('/extensions');
    const grid = page.locator('section[aria-label="Installed providers"]');
    await expect(page.getByTestId('provider-card').first()).toBeVisible({ timeout: 20_000 });

    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(columns.split(' ')).toHaveLength(1);

    const dialog = await openManifestPreview(page, longNameManifest, LONG_NAME_MANIFEST_URL);
    await dialog.getByRole('button', { name: 'Confirm install' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 20_000 });

    const cards = page.getByTestId('provider-card');
    await expect(cards).toHaveCount(2);
    const gridBox = await grid.boundingBox();
    expect(gridBox).not.toBeNull();
    if (gridBox === null) return;
    await expectNoInternalOverflow(grid);
    for (const card of await cards.all()) {
      // A widened card is the first sign the header stopped shrinking; the card
      // itself keeps scrollWidth == clientWidth once the grid track grows.
      const cardBox = await card.boundingBox();
      expect(cardBox).not.toBeNull();
      if (cardBox === null) continue;
      expect(cardBox.width).toBeLessThanOrEqual(gridBox.width + 1);
      await expectNoInternalOverflow(card);
      await expectNoInternalOverflow(card.getByTestId('provider-card-header'));
      await expectNoInternalOverflow(card.getByTestId('provider-card-badges'));
    }

    const longCard = cards.filter({ hasText: 'Audit Community Provider' });
    await expect(longCard.getByText(longNameManifest.name, { exact: true })).toBeVisible();
    await expect(longCard.getByText('Enabled', { exact: true })).toBeVisible();
    await expect(longCard.getByTestId('provider-card-badges').locator('> *')).toHaveCount(2);

    await longCard.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Provider details' })).toBeVisible({
      timeout: 20_000,
    });
    const tiles = page.getByTestId('content-flag-tile');
    await expect(tiles).toHaveCount(3);
    for (const tile of await tiles.all()) {
      await expectNoInternalOverflow(tile);
    }
  });
});

test('Given a provider detail, When Uninstall is pressed and cancelled, Then the provider survives until confirmation', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/extensions');
  const grid = page.locator('section[aria-label="Installed providers"]');
  await expect(page.getByTestId('provider-card').first()).toBeVisible({ timeout: 20_000 });
  const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(columns.split(' ')).toHaveLength(2);

  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Provider details' })).toBeVisible({
    timeout: 20_000,
  });

  const uninstallButton = page.getByRole('button', { name: 'Uninstall', exact: true });
  await uninstallButton.click();
  const dialog = page.getByRole('dialog', { name: 'Uninstall MangaDex?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('removes the provider record and its saved settings');
  await expect(dialog).toContainText('library, manga entries, and reading progress stay');
  await expect(page).toHaveURL(/\/extensions\/mangadex/);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Provider details' })).toBeVisible();
  await expect(page).toHaveURL(/\/extensions\/mangadex/);

  await uninstallButton.click();
  await page.getByRole('button', { name: 'Uninstall provider' }).click();
  await page.waitForURL((url) => url.pathname === '/extensions', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
});
