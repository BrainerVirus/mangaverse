import type { AppDrizzleDb } from '@app/db';
import type { ExtensionLogEntry, ExtensionLogLevel } from '@app/extensions-core';

export type { ExtensionLogEntry, ExtensionLogLevel };

export async function fetchProviderActivity(
  db: AppDrizzleDb,
  providerId: string,
  level?: ExtensionLogLevel,
): Promise<readonly ExtensionLogEntry[]> {
  const { listProviderActivity } = await import('@app/extensions-core');
  return listProviderActivity(db, providerId, level);
}

export async function clearProviderActivity(db: AppDrizzleDb, providerId: string): Promise<void> {
  const { clearProviderActivity: clear } = await import('@app/extensions-core');
  return clear(db, providerId);
}
