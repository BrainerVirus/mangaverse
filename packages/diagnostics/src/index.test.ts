import { describe, expect, it } from 'vitest';
import { detectWebCapabilities } from '@app/platform';
import { createWebPlatformAdapter } from '@app/platform';

import {
  DiagnosticsPage,
  PACKAGE_NAME,
  createAppPlatformAdapter,
  fetchDiagnosticsReport,
  formatDiagnosticsReport,
  formatStorageBytes,
} from './index.js';

describe('@app/diagnostics exports', () => {
  it('exports the diagnostics feature surface', () => {
    expect(PACKAGE_NAME).toBe('@app/diagnostics');
    expect(typeof DiagnosticsPage).toBe('function');
    expect(typeof fetchDiagnosticsReport).toBe('function');
    expect(typeof formatDiagnosticsReport).toBe('function');
    expect(typeof createAppPlatformAdapter).toBe('function');
  });
});

describe('formatStorageBytes', () => {
  it('formats byte values', () => {
    expect(formatStorageBytes(512)).toBe('512 B');
    expect(formatStorageBytes(2048)).toBe('2.0 KB');
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('formatDiagnosticsReport', () => {
  it('includes core sections', () => {
    const report = {
      generatedAt: '2026-05-23T00:00:00.000Z',
      appName: 'MangaVerse',
      appVersion: '0.0.1',
      runtime: 'web' as const,
      capabilities: detectWebCapabilities(),
      platformSnapshot: { platform: 'test-agent' },
      storageEstimate: { quota: 1024, usage: 256, persisted: false },
      localService: null,
      localData: {
        libraryEntryCount: 2,
        mangaIdentityCount: 2,
        installedExtensionCount: 1,
        enabledExtensionCount: 1,
        brokenExtensionCount: 0,
        categoryCount: 0,
        providerSettingsCount: 1,
      },
      localDatabaseReady: true,
    };

    const text = formatDiagnosticsReport(report);
    expect(text).toContain('MangaVerse diagnostics');
    expect(text).toContain('libraryEntries: 2');
    expect(text).toContain('runtime: web');
  });
});

describe('fetchDiagnosticsReport', () => {
  it('collects platform data without a database connection', async () => {
    const adapter = createWebPlatformAdapter();
    const capabilities = detectWebCapabilities();

    const report = await fetchDiagnosticsReport({
      adapter,
      capabilities,
      db: null,
    });

    expect(report.localDatabaseReady).toBe(false);
    expect(report.localData).toBeNull();
    expect(report.appName).toBe('MangaVerse');
    expect(report.capabilities).toEqual(capabilities);
  });
});

describe('createAppPlatformAdapter', () => {
  it('returns a web adapter when desktop bridge is absent', () => {
    const adapter = createAppPlatformAdapter();
    expect(typeof adapter.diagnostics.getSnapshot).toBe('function');
  });
});
