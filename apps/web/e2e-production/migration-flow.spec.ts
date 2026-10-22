import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

import { fixturesDir, test, TINY_JPEG, waitForPingQuiet } from './helpers.js';

test.describe.configure({ timeout: 90_000 });

// Two distinct titles: the migration batch needs more than one candidate, and
// the recorded fixture only carries a single search result.
const TITLES = [
  { id: 'b6a3f1d0-6b5a-4a1d-9f1e-1e8c1d2a3b4c', title: 'Solo Leveling' },
  { id: '0f86f7c9-2a4f-4d35-8b5e-3f5c1a2b9d10', title: 'Berserk' },
] as const;

const TARGET_MANIFEST_URL = 'https://e2e.example/target/manifest.json';

const UNSELECTED = {
  id: 'a5f0bb11-6d9c-4f39-b1be-4f06c9a8d1a2',
  title: 'Unselected Title',
} as const;

const TARGET_MANIFEST = {
  id: 'demo-target',
  name: 'Demo Target',
  version: '1.0.0',
  source: { url: 'https://e2e.example/target' },
  compatibility: { platforms: ['web', 'desktop'], minAppVersion: '1.0.0' },
  capabilities: { 'discovery.search': true, 'metadata.details': true },
  permissions: ['network.http'],
  languages: ['en'],
  contentFlags: { nsfw: false, suggestive: false, violence: false },
};

function fixtureDetail(id: string, title: string): string {
  const detail = JSON.parse(readFileSync(`${fixturesDir}/detail.json`, 'utf8')) as {
    data: { id: string; attributes: { title: Record<string, string> } };
  };
  detail.data.id = id;
  detail.data.attributes.title = { en: title };
  return JSON.stringify(detail);
}

function fixtureFeed(idPrefix: string): string {
  const feed = JSON.parse(readFileSync(`${fixturesDir}/feed.json`, 'utf8')) as {
    data: { id: string }[];
  };
  for (const chapter of feed.data) {
    // Chapters are keyed globally, so two titles served the same fixture would
    // collide on chapter ids.
    chapter.id = `${idPrefix}-${chapter.id}`;
  }
  return JSON.stringify(feed);
}

/** Serves distinct manga details plus their chapter feeds. */
async function mockTwoManga(
  page: Page,
  titles: readonly { readonly id: string; readonly title: string }[] = TITLES,
) {
  await page.route('**/api.mangadex.org/**', async (route) => {
    const url = route.request().url();
    const match = titles.find((title) => url.includes(title.id));

    if (/\/feed/.test(url)) {
      const index = titles.findIndex((title) => url.includes(title.id));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureFeed(String(index)),
      });
      return;
    }
    if (match !== undefined) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureDetail(match.id, match.title),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: readFileSync(`${fixturesDir}/search.json`, 'utf8'),
    });
  });

  await page.route('**/uploads.mangadex.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  });
}

async function addToLibrary(page: Page, id: string, title: string) {
  await page.goto(`/manga/dev-md-${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByRole('button', { name: 'Add to library' })).toHaveCount(0, {
    timeout: 20_000,
  });
}

async function installTargetProvider(page: Page) {
  await page.route(TARGET_MANIFEST_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TARGET_MANIFEST),
    });
  });

  await page.goto('/extensions?install=1');
  await page.getByLabel('Manifest URL').fill(TARGET_MANIFEST_URL);
  await page.getByRole('button', { name: 'Review manifest' }).click();
  await page.getByRole('button', { name: 'Confirm install' }).click();
  await expect(page.getByRole('dialog', { name: 'Install provider' })).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByText('Demo Target').first()).toBeVisible({ timeout: 20_000 });
}

function candidateRow(page: Page, title: string) {
  return page.locator('ul[aria-label="Migration candidates"] > li').filter({ hasText: title });
}

async function selectProvider(page: Page, name: string, provider: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: provider, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('Given two library titles and a target provider without search, When migrating, Then matches, summary, report and undo stay explicit', async ({
  page,
  quickOnboarding,
}) => {
  await mockTwoManga(page);

  for (const title of TITLES) {
    await addToLibrary(page, title.id, title.title);
  }

  await installTargetProvider(page);

  await page.goto('/migration');
  await selectProvider(page, 'Source provider', 'MangaDex');
  await selectProvider(page, 'Target provider', 'Demo Target');

  const candidates = page.getByRole('list', { name: 'Migration candidates' });
  await expect(candidates.locator(':scope > li')).toHaveCount(2, { timeout: 30_000 });

  // The installed target has no runtime binding: each row fails on its own
  // and keeps its retry instead of blanking the page.
  for (const title of TITLES) {
    await expect(candidateRow(page, title.title).getByText(/not installed or enabled/)).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await expect(
      candidateRow(page, title.title).getByRole('button', { name: 'Retry' }),
    ).toBeVisible();
  }

  await expect(page.getByText('0 of 2 selected · 0 with matches · 0 blocked')).toBeVisible();

  // Manual override is the explicit path when target search cannot run.
  await candidateRow(page, TITLES[0].title)
    .getByLabel('Target provider manga id')
    .fill('solo-leveling-target');
  await candidateRow(page, TITLES[1].title)
    .getByLabel('Target provider manga id')
    .fill('berserk-target');

  await expect(page.getByText('2 of 2 selected · 0 with matches · 0 blocked')).toBeVisible();
  await expect(
    candidateRow(page, TITLES[1].title).getByRole('checkbox', {
      name: `Include ${TITLES[1].title} in migration`,
    }),
  ).toBeChecked();

  await page.getByRole('button', { name: 'Preview migration' }).click();
  await expect(page.getByText('2 title(s) ready to migrate. 0 blocked.')).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('button', { name: 'Review and apply' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review migration' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Selected mappings (2)' })).toBeVisible();
  await expect(dialog.getByText('Preserved')).toBeVisible();
  await expect(dialog.getByText('Not migrated')).toBeVisible();

  // Opening backup keeps this draft alive in a new tab instead of navigating away.
  const backupTabPromise = page.context().waitForEvent('page');
  await dialog.getByRole('button', { name: 'Open backup' }).click();
  const backupTab = await backupTabPromise;
  await expect(backupTab).toHaveURL(/\/backup/, { timeout: 20_000 });
  await backupTab.close();
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Confirm migration' }).click();

  await expect(page.getByText('2 title(s) migrated. 0 skipped.')).toBeVisible({
    timeout: 30_000,
  });
  const report = page.getByRole('list', { name: 'Migration report items' });
  await expect(report.getByText(TITLES[0].title)).toBeVisible();
  await expect(report.getByText(TITLES[1].title)).toBeVisible();

  const history = page.getByRole('list', { name: 'Migration history' });
  await expect(history.getByRole('listitem')).toHaveCount(2, { timeout: 20_000 });

  // Undo restores the previous mappings instead of leaving the library on the target.
  await page.getByRole('button', { name: 'Undo this migration' }).click();
  await expect(page.getByText('2 title(s) restored.')).toBeVisible({ timeout: 20_000 });

  // History is persisted, not session state: a reload still shows the batch.
  await waitForPingQuiet(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedHistory = page.getByRole('list', { name: 'Migration history' });
  await expect(reloadedHistory.getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
  await expect(reloadedHistory.getByText(TITLES[0].title)).toBeVisible();
  await expect(reloadedHistory.getByText(TITLES[1].title)).toBeVisible();
});

async function migrateSelectionFromLibrary(page: Page, titles: readonly string[]) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Select titles' }).click();
  for (const title of titles) {
    await page.getByLabel(`Select ${title}`).check();
  }
  await page.getByRole('button', { name: 'Migrate selected' }).click();
  await expect(page).toHaveURL(/\/migration\?ids=/, { timeout: 20_000 });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const) {
  test.describe(`library bulk migration at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test.describe.configure({ timeout: 180_000 });

    test('Given titles selected in the library, When the bulk bar hands them to migration, Then the batch is prefilled, applied and undone', async ({
      page,
      quickOnboarding,
    }) => {
      await mockTwoManga(page, [...TITLES, UNSELECTED]);

      for (const title of [...TITLES, UNSELECTED]) {
        await addToLibrary(page, title.id, title.title);
      }
      await installTargetProvider(page);

      await migrateSelectionFromLibrary(
        page,
        TITLES.map((title) => title.title),
      );

      // Both titles came from MangaDex, so the source provider is prefilled
      // and only the handed-over candidates are listed.
      await expect(
        page.getByRole('combobox', { name: 'Source provider', exact: true }),
      ).toContainText('MangaDex', { timeout: 20_000 });
      await expect(page.getByText(/2 selected titles from MangaDex/)).toBeVisible();

      await selectProvider(page, 'Target provider', 'Demo Target');

      const candidates = page.getByRole('list', { name: 'Migration candidates' });
      await expect(candidates.locator(':scope > li')).toHaveCount(2, { timeout: 30_000 });
      await expect(candidates.getByText(UNSELECTED.title)).toHaveCount(0);

      for (const title of TITLES) {
        await expect(
          candidateRow(page, title.title).getByText(/not installed or enabled/),
        ).toBeVisible({ timeout: 30_000 });
        await candidateRow(page, title.title)
          .getByLabel('Target provider manga id')
          .fill(`${title.title.toLowerCase().replaceAll(' ', '-')}-target`);
      }

      await page.getByRole('button', { name: 'Preview migration' }).click();
      await expect(page.getByText('2 title(s) ready to migrate. 0 blocked.')).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole('button', { name: 'Review and apply' }).click();
      await page
        .getByRole('dialog', { name: 'Review migration' })
        .getByRole('button', { name: 'Confirm migration' })
        .click();

      await expect(page.getByText('2 title(s) migrated. 0 skipped.')).toBeVisible({
        timeout: 30_000,
      });
      const report = page.getByRole('list', { name: 'Migration report items' });
      await expect(report.getByText(TITLES[0].title)).toBeVisible();
      await expect(report.getByText(TITLES[1].title)).toBeVisible();

      await page.getByRole('button', { name: 'Undo this migration' }).click();
      await expect(page.getByText(/2 title\(s\) restored/)).toBeVisible({ timeout: 20_000 });
    });
  });
}

interface BackupMapping {
  id: string;
  providerId: string;
  providerMangaId: string;
  providerTitle?: string;
}

interface BackupIdentity {
  id: string;
  canonicalTitle: string;
  providerMappings: BackupMapping[];
  defaultProviderMappingId: string;
}

interface BackupDocument {
  schemaVersion: number;
  mangaIdentities: BackupIdentity[];
}

/** Adds a source-provider mapping so Demo Target (manifest only) can be the source. */
function withDemoTargetMappings(backup: BackupDocument): BackupDocument {
  return {
    ...backup,
    mangaIdentities: backup.mangaIdentities.map((identity) => ({
      ...identity,
      providerMappings: [
        ...identity.providerMappings,
        {
          id: `demo-map-${identity.id}`,
          providerId: 'demo-target',
          providerMangaId: `demo-${identity.id}`,
          providerTitle: identity.canonicalTitle,
        },
      ],
    })),
  };
}

async function exportBackupJson(page: Page): Promise<string> {
  await page.goto('/backup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).last().click();
  const download = await downloadPromise;
  return readFileSync(await download.path(), 'utf8');
}

async function restoreBackupJson(page: Page, json: string): Promise<void> {
  await page.goto('/backup');
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'migration-source.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await expect(page.getByText('Valid backup')).toBeVisible();
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(page.getByText('Restore complete')).toBeVisible({ timeout: 20_000 });
}

const RANKED_TARGETS: Record<string, { id: string; title: string }[]> = {
  'Solo Leveling': [
    { id: 'e2e-solo-near', title: 'Solo Leveling: Ragnarok' },
    { id: 'e2e-solo-exact', title: 'Solo Leveling' },
  ],
  Berserk: [
    { id: 'e2e-berserk-near', title: 'Berserk of Gluttony' },
    { id: 'e2e-berserk-exact', title: 'Berserk' },
  ],
};

/** Answers the target provider's title search with intentionally out-of-rank order. */
async function mockRankedTargetSearch(page: Page) {
  await page.route(/\/api\.mangadex\.org\/manga\?/, async (route) => {
    const title = new URL(route.request().url()).searchParams.get('title') ?? '';
    const ranked = RANKED_TARGETS[title];
    if (ranked === undefined) {
      await route.fallback();
      return;
    }

    const body = JSON.parse(readFileSync(`${fixturesDir}/search.json`, 'utf8')) as {
      data: Record<string, unknown>[];
      total: number;
    };
    const base = body.data[0]!;
    body.data = ranked.map((candidate) => ({
      ...base,
      id: candidate.id,
      attributes: {
        ...(base['attributes'] as Record<string, unknown>),
        title: { en: candidate.title },
      },
    }));
    body.total = body.data.length;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('Given a searchable target provider, When a title is searched, Then the ranked match drives selection and the confirm dialog', async ({
  page,
  quickOnboarding,
}) => {
  await mockTwoManga(page);
  await mockRankedTargetSearch(page);

  for (const title of TITLES) {
    await addToLibrary(page, title.id, title.title);
  }
  await installTargetProvider(page);

  // Seed a Demo Target source mapping through backup restore: only MangaDex
  // ships a runtime search binding, so it must be the target.
  const backup = JSON.parse(await exportBackupJson(page)) as BackupDocument;
  await restoreBackupJson(page, JSON.stringify(withDemoTargetMappings(backup)));

  await page.goto('/migration');
  await selectProvider(page, 'Source provider', 'Demo Target');
  await selectProvider(page, 'Target provider', 'MangaDex');

  const candidates = page.getByRole('list', { name: 'Migration candidates' });
  await expect(candidates.locator(':scope > li')).toHaveCount(2, { timeout: 30_000 });

  const soloRow = candidateRow(page, TITLES[0].title);
  const soloMatches = soloRow.getByRole('list', { name: 'Target matches for Solo Leveling' });
  await expect(soloMatches.getByRole('button').first()).toHaveText(
    /Solo Leveling.*exact.*e2e-solo-exact/,
    { timeout: 30_000 },
  );
  await soloMatches.getByRole('button').first().click();

  const berserkRow = candidateRow(page, TITLES[1].title);
  const berserkMatches = berserkRow.getByRole('list', {
    name: 'Target matches for Berserk',
  });
  await expect(berserkMatches.getByRole('button').first()).toHaveText(
    /Berserk.*exact.*e2e-berserk-exact/,
    { timeout: 30_000 },
  );
  await berserkMatches.getByRole('button').first().click();

  await expect(page.getByText('2 of 2 selected · 2 with matches · 0 blocked')).toBeVisible();

  await page.getByRole('button', { name: 'Preview migration' }).click();
  await expect(page.getByText('2 title(s) ready to migrate. 0 blocked.')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Review and apply' }).click();

  const dialog = page.getByRole('dialog', { name: 'Review migration' });
  await expect(dialog.getByText('Solo Leveling (e2e-solo-exact)')).toBeVisible();
  await expect(dialog.getByText('Berserk (e2e-berserk-exact)')).toBeVisible();

  await dialog.getByRole('button', { name: 'Confirm migration' }).click();
  await expect(page.getByText('2 title(s) migrated. 0 skipped.')).toBeVisible({
    timeout: 30_000,
  });

  // No pointer moved for these titles (default/active stayed on MangaDex), so
  // undo reports the batch as already restored instead of failing.
  await page.getByRole('button', { name: 'Undo this migration' }).click();
  await expect(
    page.getByText('0 title(s) restored. 2 already matched the previous state.'),
  ).toBeVisible({ timeout: 20_000 });
});
