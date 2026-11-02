import type { AppDrizzleDb } from '@app/db';
import type {
  ExtensionLogCounts,
  ExtensionLogEntry,
  ExtensionLogLevel,
  ProviderActivitySummary,
} from './core/index.js';

export type { ExtensionLogCounts, ExtensionLogEntry, ExtensionLogLevel, ProviderActivitySummary };

export async function fetchProviderActivity(
  db: AppDrizzleDb,
  providerId: string,
  level?: ExtensionLogLevel,
  limit?: number,
): Promise<readonly ExtensionLogEntry[]> {
  const { listProviderActivity } = await import('./core/index.js');
  return listProviderActivity(db, providerId, level, limit);
}

export async function fetchProviderActivitySummary(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderActivitySummary> {
  const { getProviderActivitySummary } = await import('./core/index.js');
  return getProviderActivitySummary(db, providerId);
}

export async function clearProviderActivity(db: AppDrizzleDb, providerId: string): Promise<void> {
  const { clearProviderActivity: clear } = await import('./core/index.js');
  return clear(db, providerId);
}
