import type { AppDrizzleDb } from '@app/db';
import type {
  ExtensionLogCounts,
  ExtensionLogEntry,
  ExtensionLogLevel,
  ProviderActivitySummary,
} from '@app/extensions-core';

export type { ExtensionLogCounts, ExtensionLogEntry, ExtensionLogLevel, ProviderActivitySummary };

export async function fetchProviderActivity(
  db: AppDrizzleDb,
  providerId: string,
  level?: ExtensionLogLevel,
  limit?: number,
): Promise<readonly ExtensionLogEntry[]> {
  const { listProviderActivity } = await import('@app/extensions-core');
  return listProviderActivity(db, providerId, level, limit);
}

export async function fetchProviderActivitySummary(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderActivitySummary> {
  const { getProviderActivitySummary } = await import('@app/extensions-core');
  return getProviderActivitySummary(db, providerId);
}

export async function clearProviderActivity(db: AppDrizzleDb, providerId: string): Promise<void> {
  const { clearProviderActivity: clear } = await import('@app/extensions-core');
  return clear(db, providerId);
}
