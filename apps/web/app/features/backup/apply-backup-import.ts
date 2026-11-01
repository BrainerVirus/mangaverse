import type { AppDrizzleDb } from '@app/db';
import type { AppResult, BackupDocumentV1 } from '@app/shared';
import { createAppError, err } from '@app/shared';

import { validateBackupThemeColors } from './validate-backup-themes.js';

export async function applyBackupImport(
  db: AppDrizzleDb,
  input: unknown,
): Promise<AppResult<BackupDocumentV1>> {
  const themeIssues = validateBackupThemeColors(input);
  if (themeIssues.length > 0) {
    const first = themeIssues[0]!;
    return err(
      createAppError({
        code: 'backup.invalid',
        message: first.message,
        details: { path: first.path },
      }),
    );
  }
  const { applyBackupRestore } = await import('@app/db');
  return applyBackupRestore(db, input);
}
