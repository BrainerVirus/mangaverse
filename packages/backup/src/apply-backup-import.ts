import type { AppDrizzleDb } from '@app/db';
import type { AppResult, BackupDocumentV1 } from '@app/shared';

export async function applyBackupImport(
  db: AppDrizzleDb,
  input: unknown,
): Promise<AppResult<BackupDocumentV1>> {
  const { applyBackupRestore } = await import('@app/db');
  return applyBackupRestore(db, input);
}
