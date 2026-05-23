import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, getDefaultReaderSettings } from '@app/shared';
import { createSqlJsHarness } from '@app/db/testing';

import {
  applyBackupImport,
  BackupPage,
  buildBackupFilename,
  createBackupExport,
  PACKAGE_NAME,
  parseBackupFileContent,
  previewBackupImport,
  serializeBackupDocument,
  summarizeRestorePreview,
} from './index.js';

describe('@app/backup exports', () => {
  it('exports the backup feature surface', () => {
    expect(PACKAGE_NAME).toBe('@app/backup');
    expect(typeof BackupPage).toBe('function');
    expect(typeof createBackupExport).toBe('function');
    expect(typeof parseBackupFileContent).toBe('function');
    expect(typeof previewBackupImport).toBe('function');
    expect(typeof applyBackupImport).toBe('function');
  });
});

describe('parseBackupFileContent', () => {
  it('rejects invalid JSON', () => {
    const result = parseBackupFileContent('{not-json');
    expect(result.ok).toBe(false);
  });

  it('validates a minimal backup document', () => {
    const doc = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      metadata: { createdAt: new Date().toISOString(), appVersion: '0.0.1' },
      library: [],
      mangaIdentities: [],
      installedExtensions: [],
      readerSettings: getDefaultReaderSettings(),
      providerSettings: { providerSnapshots: [] },
      themeSettings: { presetId: 'default', dark: false },
    };
    const result = parseBackupFileContent(JSON.stringify(doc));
    expect(result.ok).toBe(true);
  });
});

describe('summarizeRestorePreview', () => {
  it('blocks restore when backup validation fails', () => {
    const summary = summarizeRestorePreview({
      backupOk: false,
      backupIssues: [{ path: 'schemaVersion', code: 'backup.invalid', message: 'bad schema' }],
      previewIssues: [],
    });
    expect(summary.canRestore).toBe(false);
    expect(summary.errorCount).toBe(1);
  });
});

describe('backup export helpers', () => {
  it('builds a dated filename and serializes JSON', async () => {
    const { db } = await createSqlJsHarness();
    const doc = await createBackupExport(db);
    expect(buildBackupFilename(doc)).toMatch(/^mangaverse-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(serializeBackupDocument(doc)).toContain('"schemaVersion"');
  });

  it('previews and applies a round-trip backup', async () => {
    const { db: sourceDb } = await createSqlJsHarness();
    const doc = await createBackupExport(sourceDb);
    const { db: targetDb } = await createSqlJsHarness();

    const preview = await previewBackupImport(targetDb, doc);
    expect(preview.backupOk).toBe(true);
    expect(summarizeRestorePreview(preview).canRestore).toBe(true);

    const restored = await applyBackupImport(targetDb, doc);
    expect(restored.ok).toBe(true);
  });
});
