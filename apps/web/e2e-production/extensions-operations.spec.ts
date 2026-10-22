import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { test } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

const MANIFEST_URL = 'https://manifest.audit.test/ops.json';

const baseManifest = {
  id: 'ops-audit',
  name: 'Ops Audit Provider',
  version: '1.0.0',
  source: { url: 'https://cdn.audit.test/ops' },
  compatibility: { platforms: ['web'] },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

async function installProvider(page: Page): Promise<void> {
  await page.goto('/extensions?install=1');
  const dialog = page.getByRole('dialog', { name: 'Install provider' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByLabel('Manifest URL').fill(MANIFEST_URL);
  await dialog.getByRole('button', { name: 'Review manifest' }).click();
  await expect(dialog.getByText('Ops Audit Provider')).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Confirm install' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 20_000 });

  await page.goto('/extensions');
  const card = page.getByTestId('provider-card').filter({ hasText: 'Ops Audit Provider' });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Provider details' })).toBeVisible({
    timeout: 20_000,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function runOperationsFlow(page: Page, remote: Record<string, unknown>) {
  await page.route('https://manifest.audit.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(remote),
    }),
  );

  await installProvider(page);

  // Health: the custom provider has no runtime binding, so the structural check
  // fails visibly with a reason instead of silently succeeding.
  await page.getByRole('button', { name: 'Run health check' }).click();
  const health = page.getByRole('status', { name: 'Health check results' });
  await expect(health).toBeVisible({ timeout: 20_000 });
  await expect(health).toContainText('Runtime binding');
  await expect(health).toContainText('No runtime binding is registered.');
  await expect(page.getByText(/Last check:/)).toBeVisible();

  // Update check: same version first, then the remote manifest moves to 2.0.0.
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Provider is up to date at v1.0.0.' }),
  ).toBeVisible({ timeout: 20_000 });

  remote.version = '2.0.0';
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Update available: v2.0.0.' }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Update to v2.0.0' }).click();
  const confirm = page.getByRole('dialog', { name: 'Update Ops Audit Provider to v2.0.0?' });
  await expect(confirm).toContainText('Enabled state and saved settings stay as they are.');
  await confirm.getByRole('button', { name: 'Update provider' }).click();
  await expect(confirm).not.toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('v2.0.0 · ops-audit')).toBeVisible({ timeout: 20_000 });

  // Activity: the health failure is an error entry; filter, then export it.
  await page.getByLabel('Filter activity by level').click();
  await page.getByRole('option', { name: 'Errors' }).click();
  await expect(page.getByText('extensions.health.broken')).toBeVisible({ timeout: 20_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export activity' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ops-audit-activity.json');
  const downloadPath = await download.path();
  const exported = JSON.parse(readFileSync(downloadPath, 'utf8')) as {
    providerId: string;
    exportedAt: string;
    level: string;
    logs: Array<Record<string, unknown>>;
  };
  expect(exported.providerId).toBe('ops-audit');
  expect(exported.level).toBe('error');
  expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
  expect(exported.logs.length).toBeGreaterThan(0);
  expect(exported.logs.some((log) => log.code === 'extensions.health.broken')).toBe(true);
  for (const log of exported.logs) {
    expect(Object.keys(log).sort()).toEqual([
      'code',
      'createdAt',
      'details',
      'id',
      'level',
      'message',
      'providerId',
    ]);
    const message = String(log.message);
    expect(message).not.toMatch(/Bearer\s+(?!\[redacted\])/);
    expect(message).not.toMatch(/(?:token|api[_-]?key|secret|password)=/i);
    expect(message).not.toMatch(/https?:\/\/[^\s]*\?/);
  }

  await page.getByLabel('Filter activity by level').click();
  await page.getByRole('option', { name: 'All levels' }).click();
  await page.getByRole('button', { name: 'Clear activity' }).click();
  await expect(page.getByText('No activity recorded for this provider.')).toBeVisible({
    timeout: 20_000,
  });

  await expectNoHorizontalOverflow(page);
}

test.describe('provider operations at 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Given an installed provider at mobile width, Then health, update and activity flows work', async ({
    page,
    quickOnboarding,
  }) => {
    await runOperationsFlow(page, { ...baseManifest });
  });
});

test.describe('provider operations at 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Given an installed provider at desktop width, Then health, update and activity flows work', async ({
    page,
    quickOnboarding,
  }) => {
    await runOperationsFlow(page, { ...baseManifest });
  });
});
