import type { BackupValidationResult } from '@app/shared';
import { createAppError, validateBackupDocument } from '@app/shared';

export function parseBackupFileContent(content: string): BackupValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const message = 'Backup file is not valid JSON.';
    return {
      ok: false,
      error: createAppError({ code: 'backup.invalid', message }),
      issues: [{ path: '', code: 'backup.invalid', message }],
    };
  }

  return validateBackupDocument(parsed);
}
