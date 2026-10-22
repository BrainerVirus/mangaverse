import { and, desc, eq, like, notInArray, sql } from 'drizzle-orm';
import type { AppDrizzleDb } from '../adapter.js';
import { extensionLogs } from '../schema.js';

export type ExtensionLogLevel = 'info' | 'warn' | 'error';

export interface ExtensionLogEntry {
  readonly id: string;
  readonly providerId: string;
  readonly level: ExtensionLogLevel;
  readonly code: string;
  readonly message: string;
  readonly details: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface AppendExtensionLogInput {
  readonly providerId: string;
  readonly level: ExtensionLogLevel;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly createdAt?: string;
}

/** Newest rows kept per provider and across all providers. */
export const EXTENSION_LOG_RETENTION_PER_PROVIDER = 500;
export const EXTENSION_LOG_RETENTION_GLOBAL = 2000;

function insertRow(db: AppDrizzleDb, input: AppendExtensionLogInput): void {
  db.insert(extensionLogs)
    .values({
      id: crypto.randomUUID(),
      providerId: input.providerId,
      level: input.level,
      code: input.code,
      message: input.message,
      detailsJson: input.details ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    })
    .run();
}

function prune(db: AppDrizzleDb, providerId: string): void {
  const providerIds = db
    .select({ id: extensionLogs.id })
    .from(extensionLogs)
    .where(eq(extensionLogs.providerId, providerId))
    .orderBy(desc(extensionLogs.createdAt), desc(sql`extension_logs.rowid`))
    .limit(EXTENSION_LOG_RETENTION_PER_PROVIDER)
    .all()
    .map((row) => row.id);
  db.delete(extensionLogs)
    .where(and(eq(extensionLogs.providerId, providerId), notInArray(extensionLogs.id, providerIds)))
    .run();

  const globalIds = db
    .select({ id: extensionLogs.id })
    .from(extensionLogs)
    .orderBy(desc(extensionLogs.createdAt), desc(sql`extension_logs.rowid`))
    .limit(EXTENSION_LOG_RETENTION_GLOBAL)
    .all()
    .map((row) => row.id);
  db.delete(extensionLogs).where(notInArray(extensionLogs.id, globalIds)).run();
}

/** Appends one entry and trims the per-provider and global retention windows. */
export async function appendExtensionLog(
  db: AppDrizzleDb,
  input: AppendExtensionLogInput,
): Promise<void> {
  insertRow(db, input);
  prune(db, input.providerId);
}

export async function listExtensionLogs(
  db: AppDrizzleDb,
  filter: {
    readonly providerId?: string;
    readonly level?: ExtensionLogLevel;
    /** Prefix match, e.g. `extensions.health.` to find the latest health check. */
    readonly codePrefix?: string;
    readonly limit?: number;
  } = {},
): Promise<ExtensionLogEntry[]> {
  const conditions = [
    ...(filter.providerId !== undefined ? [eq(extensionLogs.providerId, filter.providerId)] : []),
    ...(filter.level !== undefined ? [eq(extensionLogs.level, filter.level)] : []),
    ...(filter.codePrefix !== undefined ? [like(extensionLogs.code, `${filter.codePrefix}%`)] : []),
  ];
  const query = db.select().from(extensionLogs);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  const rows = filtered
    .orderBy(desc(extensionLogs.createdAt), desc(sql`extension_logs.rowid`))
    .limit(filter.limit ?? 100)
    .all();

  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    level:
      row.level === 'error' || row.level === 'warn' || row.level === 'info' ? row.level : 'info',
    code: row.code,
    message: row.message,
    details: row.detailsJson ?? null,
    createdAt: row.createdAt,
  }));
}

export async function clearExtensionLogs(db: AppDrizzleDb, providerId?: string): Promise<void> {
  if (providerId === undefined) {
    db.delete(extensionLogs).run();
    return;
  }
  db.delete(extensionLogs).where(eq(extensionLogs.providerId, providerId)).run();
}

export interface ExtensionLogCounts {
  readonly total: number;
  readonly info: number;
  readonly errors: number;
  readonly warnings: number;
}

export interface ExtensionLogCountFilter {
  readonly providerId?: string;
  readonly level?: ExtensionLogLevel;
}

export async function countExtensionLogs(
  db: AppDrizzleDb,
  filter: ExtensionLogCountFilter = {},
): Promise<ExtensionLogCounts> {
  const conditions = [
    ...(filter.providerId !== undefined ? [eq(extensionLogs.providerId, filter.providerId)] : []),
    ...(filter.level !== undefined ? [eq(extensionLogs.level, filter.level)] : []),
  ];
  const query = db.select({ level: extensionLogs.level }).from(extensionLogs);
  const rows = conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();
  return {
    total: rows.length,
    info: rows.filter((row) => row.level === 'info').length,
    errors: rows.filter((row) => row.level === 'error').length,
    warnings: rows.filter((row) => row.level === 'warn').length,
  };
}
