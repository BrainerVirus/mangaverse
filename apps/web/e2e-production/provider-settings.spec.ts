import { expect } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

test('Given provider settings, When saved and reloaded, Then they persist and reach provider calls', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/extensions');
  await expect(page.getByTestId('provider-card').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Provider details' })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByLabel('Preferred languages').fill('ja, en');
  await page.getByRole('switch', { name: 'Allow mature content' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible({ timeout: 20_000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Provider details' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel('Preferred languages')).toHaveValue('ja, en');
  await expect(page.getByRole('switch', { name: 'Allow mature content' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  const providerRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('api.mangadex.org/manga?')) providerRequests.push(url);
  });

  await page.goto('/search');
  await page.getByLabel('Search manga').fill('dandadan');
  await expect.poll(() => providerRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const params = new URL(providerRequests[0]!).searchParams;
  expect(params.getAll('availableTranslatedLanguage[]')).toContain('ja');
  // App explicit-content is off by default, so the provider's NSFW setting stays gated.
  expect(params.getAll('contentRating[]')).not.toContain('erotica');
});

test('Given a registry document, When previewed and imported, Then it is listed and installs no provider', async ({
  page,
  quickOnboarding,
}) => {
  await page.goto('/extensions');
  await page.getByRole('button', { name: 'Import', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Import registry or extensions' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Registry or extension JSON').fill(
    JSON.stringify({
      name: 'Audit Registry',
      registryUrl: 'https://registry.audit.test/index.json',
      entries: [
        { name: 'Audit Provider', manifestUrl: 'https://manifest.audit.test/provider.json' },
        { name: 'Broken entry' },
      ],
    }),
  );
  await dialog.getByRole('button', { name: 'Preview' }).click();

  const preview = dialog.getByTestId('registry-import-preview');
  await expect(preview).toContainText('Audit Registry');
  await expect(preview).toContainText('Audit Provider');
  await expect(preview).toContainText('Entry 1 is missing a manifest URL.');
  await expect(preview).toContainText('adds no provider entries');

  await dialog.getByRole('button', { name: 'Import registry' }).click();
  await expect(dialog).not.toBeVisible();

  const registries = page.getByRole('region', { name: 'Imported registries' });
  await expect(registries).toContainText('Audit Registry');
  await expect(registries).toContainText('https://registry.audit.test/index.json');
});
