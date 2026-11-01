import type { AppDrizzleDb } from '@app/db';
import {
  appendExtensionLog,
  clearExtensionLogs,
  countExtensionLogs,
  listExtensionLogs,
  type ExtensionLogCounts,
  type ExtensionLogEntry,
  type ExtensionLogLevel,
} from '@app/db';
import { sanitizeLogDetails, sanitizeLogMessage } from '@app/shared';

// Kept as a re-export so the provider log and the Diagnostics event log share
// exactly one redactor, and the provider-log assertions keep guarding it.
export { sanitizeLogDetails, sanitizeLogMessage };

export type { ExtensionLogCounts, ExtensionLogEntry, ExtensionLogLevel };

export type ProviderOperation =
  | 'search'
  | 'discover'
  | 'details'
  | 'chapters'
  | 'pages'
  | 'install'
  | 'update'
  | 'uninstall'
  | 'health'
  | 'update-check';

export interface ExtensionLogInput {
  readonly providerId: string;
  readonly level: ExtensionLogLevel;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/** Same failure from the same provider is written at most once per window. */
const PAGE_FAILURE_WINDOW_MS = 60_000;
const recentPageFailures = new Map<string, number>();

/** Test seam: clears the in-memory page-failure throttle. */
export function resetExtensionLogThrottle(): void {
  recentPageFailures.clear();
}

/**
 * Persists one log entry. A logging failure must never fail the provider
 * operation that produced it, so write errors are swallowed here.
 */
export async function recordExtensionLog(
  db: AppDrizzleDb,
  input: ExtensionLogInput,
): Promise<void> {
  try {
    await appendExtensionLog(db, {
      providerId: input.providerId,
      level: input.level,
      code: sanitizeLogMessage(input.code),
      message: sanitizeLogMessage(input.message),
      ...(input.details !== undefined ? { details: sanitizeLogDetails(input.details) ?? {} } : {}),
    });
  } catch {
    // Diagnostics are best effort; never break a provider call over a log write.
  }
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'extensions.logs.failure';
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'Provider operation failed.';
}

/**
 * Captures a normalized provider failure for Diagnostics. Page failures are
 * throttled: reading a broken chapter must not turn into a write per page.
 */
export async function recordProviderFailure(
  db: AppDrizzleDb,
  input: {
    readonly providerId: string;
    readonly operation: ProviderOperation;
    readonly error: unknown;
    readonly signal?: AbortSignal;
    readonly now?: number;
  },
): Promise<void> {
  // Aborts are user intent, not a provider failure.
  if (input.signal?.aborted === true) return;

  const code = errorCode(input.error);
  if (input.operation === 'pages') {
    const key = `${input.providerId}:${code}`;
    const now = input.now ?? Date.now();
    const seen = recentPageFailures.get(key);
    if (seen !== undefined && now - seen < PAGE_FAILURE_WINDOW_MS) return;
    recentPageFailures.set(key, now);
  }

  await recordExtensionLog(db, {
    providerId: input.providerId,
    level: 'error',
    code,
    message: errorMessage(input.error),
    details: { operation: input.operation },
  });
}

export async function listProviderActivity(
  db: AppDrizzleDb,
  providerId: string,
  level?: ExtensionLogLevel,
  limit = 100,
): Promise<ExtensionLogEntry[]> {
  return listExtensionLogs(db, {
    providerId,
    ...(level !== undefined ? { level } : {}),
    limit,
  });
}

export interface ProviderActivitySummary {
  readonly counts: ExtensionLogCounts;
  readonly lastHealthCheckAt: string | null;
}

/**
 * Counts come from the full retained set, not the latest page, so an empty
 * level filter never hides an older entry that is still retained.
 */
export async function getProviderActivitySummary(
  db: AppDrizzleDb,
  providerId: string,
): Promise<ProviderActivitySummary> {
  const [counts, latestHealth] = await Promise.all([
    countExtensionLogs(db, { providerId }),
    listExtensionLogs(db, { providerId, codePrefix: 'extensions.health.', limit: 1 }),
  ]);
  return { counts, lastHealthCheckAt: latestHealth[0]?.createdAt ?? null };
}

export async function clearProviderActivity(db: AppDrizzleDb, providerId: string): Promise<void> {
  await clearExtensionLogs(db, providerId);
}
