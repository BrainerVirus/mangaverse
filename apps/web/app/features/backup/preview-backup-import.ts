import type { AppDrizzleDb, RestorePreviewReport } from '@app/db';

import { validateBackupThemeColors } from './validate-backup-themes.js';

export async function previewBackupImport(
  db: AppDrizzleDb,
  input: unknown,
): Promise<RestorePreviewReport> {
  const themeIssues = validateBackupThemeColors(input);
  if (themeIssues.length > 0) {
    return {
      backupOk: false,
      backupIssues: themeIssues,
      previewIssues: [],
      schemaVersion: null,
      counts: {
        libraryEntries: 0,
        categories: 0,
        categoryMemberships: 0,
        chapters: 0,
        chapterReadStates: 0,
        readingHistory: 0,
        migrationHistory: 0,
      },
    };
  }
  const { previewBackupRestore } = await import('@app/db');
  return previewBackupRestore(db, input);
}
