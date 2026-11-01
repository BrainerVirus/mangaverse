import type { AppDrizzleDb } from '@app/db';

/** Undo the mapping pointers one applied batch changed. */
export async function rollbackMigration(
  db: AppDrizzleDb,
  input: {
    readonly batchId: string;
  },
) {
  const { rollbackProviderMigration } = await import('@app/db');
  return rollbackProviderMigration(db, input);
}
