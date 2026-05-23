import type { AppDrizzleDb, LocalDatabaseSummary } from '@app/db';

export type LocalDataSummary = LocalDatabaseSummary;

export async function fetchLocalDataSummary(db: AppDrizzleDb): Promise<LocalDataSummary> {
  const { summarizeLocalDatabase } = await import('@app/db');
  return summarizeLocalDatabase(db);
}
