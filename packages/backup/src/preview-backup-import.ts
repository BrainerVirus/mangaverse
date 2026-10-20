import type { AppDrizzleDb, RestorePreviewReport } from '@app/db';

import { validateBackupThemeColors } from './validate-backup-themes.js';

export async function previewBackupImport(
  db: AppDrizzleDb,
  input: unknown,
): Promise<RestorePreviewReport> {
  const themeIssues = validateBackupThemeColors(input);
  if (themeIssues.length > 0) {
    return { backupOk: false, backupIssues: themeIssues, previewIssues: [] };
  }
  const { previewBackupRestore } = await import('@app/db');
  return previewBackupRestore(db, input);
}
