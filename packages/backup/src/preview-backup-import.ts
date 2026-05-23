import type { AppDrizzleDb, RestorePreviewReport } from '@app/db';

export async function previewBackupImport(db: AppDrizzleDb, input: unknown): Promise<RestorePreviewReport> {
  const { previewBackupRestore } = await import('@app/db');
  return previewBackupRestore(db, input);
}
