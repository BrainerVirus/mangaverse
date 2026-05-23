import type { AppDrizzleDb } from '@app/db';
import type { BackupDocumentV1 } from '@app/shared';

import { BACKUP_APP_VERSION } from './constants.js';

export async function createBackupExport(
  db: AppDrizzleDb,
  options?: { readonly deviceName?: string },
): Promise<BackupDocumentV1> {
  const { exportBackupDocumentV1 } = await import('@app/db');
  return exportBackupDocumentV1(db, {
    createdAt: new Date().toISOString(),
    appVersion: BACKUP_APP_VERSION,
    ...(options?.deviceName !== undefined ? { deviceName: options.deviceName } : {}),
  });
}

export function serializeBackupDocument(doc: BackupDocumentV1): string {
  return JSON.stringify(doc, null, 2);
}

export function buildBackupFilename(doc: BackupDocumentV1): string {
  const date = doc.metadata.createdAt.slice(0, 10);
  return `mangaverse-backup-${date}.json`;
}

export function downloadBackupDocument(doc: BackupDocumentV1): void {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([serializeBackupDocument(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildBackupFilename(doc);
  anchor.click();
  URL.revokeObjectURL(url);
}
