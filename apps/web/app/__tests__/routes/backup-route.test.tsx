/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as BackupModule from '@app/backup';
import type * as CacheModule from '@app/cache';
import type * as SettingsModule from '@app/settings';
import { getDefaultAppSettings, type AppSettings } from '@app/shared';

const mocks = vi.hoisted(() => ({
  applyBackupImport: vi.fn<(db: unknown, doc: unknown) => Promise<unknown>>(),
  createBackupExport: vi.fn<() => Promise<unknown>>(),
  downloadBackupDocument: vi.fn<() => void>(),
  parseBackupFileContent: vi.fn<(content: string) => unknown>(),
  previewBackupImport: vi.fn<(db: unknown, doc: unknown) => Promise<unknown>>(),
  fetchAppSettings: vi.fn<(db: unknown) => Promise<{ settings: AppSettings }>>(),
  saveAppSettings: vi.fn<(db: unknown, next: AppSettings) => Promise<unknown>>(),
  getCoverCacheUsage: vi.fn<() => Promise<{ totalBytes: number }>>(),
}));

vi.mock('@app/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof BackupModule>();
  return {
    ...actual,
    applyBackupImport: mocks.applyBackupImport,
    createBackupExport: mocks.createBackupExport,
    downloadBackupDocument: mocks.downloadBackupDocument,
    parseBackupFileContent: mocks.parseBackupFileContent,
    previewBackupImport: mocks.previewBackupImport,
  };
});

vi.mock('@app/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return {
    ...actual,
    fetchAppSettings: mocks.fetchAppSettings,
    saveAppSettings: mocks.saveAppSettings,
  };
});

vi.mock('@app/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>();
  return { ...actual, getCoverCacheUsage: mocks.getCoverCacheUsage };
});

vi.mock('../../providers/local-db-provider.js', () => ({
  useLocalDb: () => ({ id: 'fake-db' }),
  useLocalDbStatus: () => 'ready',
  useLocalDbRetry: () => vi.fn<() => void>(),
}));

import { Route as BackupRoute } from '../../routes/backup.lazy.js';
import { Route as SettingsAppRoute } from '../../routes/settings.app.js';

/** Restore writes the row; reads afterwards must come from this store. */
let storedSettings: AppSettings;

const SETTINGS_STALE_TIME_MS = 10 * 60 * 1_000;

const backupDocument = { schemaVersion: 3, metadata: { createdAt: '', appVersion: 'test' } };

async function renderRoutes(client: QueryClient): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BackupRoute.options.component />
        <SettingsAppRoute.options.component />
      </QueryClientProvider>,
    );
  });
  return { root, container };
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function selectBackupFile(): Promise<void> {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (fileInput === null) throw new Error('Backup file input not found.');
  const file = new File(['{}'], 'backup.json', { type: 'application/json' });
  await act(async () => {
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function runRestore(): Promise<void> {
  await selectBackupFile();

  await click(await vi.waitFor(() => getButton('Restore backup')));
  await click(await vi.waitFor(() => getButton('Confirm restore')));
}

function getButton(name: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (button === undefined) throw new Error(`Button "${name}" not found.`);
  return button;
}

function settingsSwitch(label: string): HTMLButtonElement {
  const control = document.querySelector<HTMLButtonElement>(
    `button[role="switch"][aria-label="${label}"]`,
  );
  if (control === null) throw new Error(`Switch "${label}" not found.`);
  return control;
}

describe('/backup restore and /settings/app freshness', () => {
  beforeEach(() => {
    storedSettings = getDefaultAppSettings();
    mocks.fetchAppSettings.mockReset();
    mocks.fetchAppSettings.mockImplementation(async () => ({ settings: storedSettings }));
    mocks.saveAppSettings.mockReset();
    mocks.saveAppSettings.mockImplementation(async (_db, next) => {
      storedSettings = next;
      return { ok: true, value: next };
    });
    mocks.parseBackupFileContent.mockReset();
    mocks.parseBackupFileContent.mockReturnValue({ ok: true, value: backupDocument });
    mocks.previewBackupImport.mockReset();
    mocks.previewBackupImport.mockResolvedValue({
      backupOk: true,
      backupIssues: [],
      previewIssues: [],
      schemaVersion: 4,
      counts: {
        libraryEntries: 0,
        categories: 0,
        categoryMemberships: 0,
        chapters: 0,
        chapterReadStates: 0,
        readingHistory: 0,
        migrationHistory: 0,
      },
    });
    mocks.applyBackupImport.mockReset();
    mocks.applyBackupImport.mockImplementation(async () => {
      storedSettings = { ...storedSettings, explicitContent: true };
      return { ok: true, value: backupDocument };
    });
    mocks.getCoverCacheUsage.mockReset();
    mocks.getCoverCacheUsage.mockResolvedValue({ totalBytes: 0 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Given a restore, When settings are open, Then the settings query refetches and the next edit keeps the restored row', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: SETTINGS_STALE_TIME_MS } },
    });
    const { root, container } = await renderRoutes(client);

    await vi.waitFor(() =>
      expect(settingsSwitch('Explicit content').getAttribute('aria-checked')).toBe('false'),
    );
    expect(mocks.fetchAppSettings).toHaveBeenCalledTimes(1);

    await runRestore();

    // Without the settings invalidation the page keeps the 10-minute-old row.
    await vi.waitFor(() =>
      expect(settingsSwitch('Explicit content').getAttribute('aria-checked')).toBe('true'),
    );
    expect(mocks.fetchAppSettings).toHaveBeenCalledTimes(2);

    await click(settingsSwitch('Motion'));

    expect(mocks.saveAppSettings).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ explicitContent: true, reduceMotion: true }),
    );

    act(() => root.unmount());
    container.remove();
    client.clear();
  });

  it('Given a valid backup, When previewed, Then the counts for the new sections are visible', async () => {
    mocks.previewBackupImport.mockResolvedValue({
      backupOk: true,
      backupIssues: [],
      previewIssues: [],
      schemaVersion: 4,
      counts: {
        libraryEntries: 3,
        categories: 2,
        categoryMemberships: 4,
        chapters: 37,
        chapterReadStates: 7,
        readingHistory: 9,
        migrationHistory: 1,
      },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { root, container } = await renderRoutes(client);

    await selectBackupFile();

    await vi.waitFor(() => {
      const list = document.querySelector('dl[aria-label="Backup contents"]');
      expect(list).not.toBeNull();
      expect(list?.textContent).toContain('Categories');
      expect(list?.textContent).toContain('2');
      expect(list?.textContent).toContain('Chapter progress');
      expect(list?.textContent).toContain('7');
      expect(list?.textContent).toContain('Reading history');
      expect(list?.textContent).toContain('9');
      expect(list?.textContent).toContain('Migration history');
    });

    act(() => root.unmount());
    container.remove();
    client.clear();
  });
});
