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

const SAFE_DETAIL_KEYS = new Set([
  'operation',
  'endpoint',
  'status',
  'mangaId',
  'chapterId',
  'version',
  'count',
  'checks',
]);

const UNSAFE_DETAIL_KEY = /token|secret|auth|password|credential|key|url|uri|query|cookie|session/i;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Removes credentials, cookies, query strings and authorization values from anything persisted. */
export function sanitizeLogMessage(message: string): string {
  return truncate(
    message
      // Quoted JSON credential fields: "authorization":"Basic …", "cookie":"session=…".
      .replace(
        /(["'])((?:proxy-)?authorization|cookie|set-cookie)\1\s*:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]\n\r]*\]|\{[^}\n\r]*\}|[^,}\n\r]+)/gi,
        '"$2":"[redacted]"',
      )
      // Authorization and cookie header values may contain a scheme, spaces or
      // several pairs; redact the line remainder once the header name is known.
      .replace(
        /\b((?:proxy-)?authorization|set-cookie|cookie)\s*:\s*(?:"[^"]*"|'[^']*'|[^\n\r]+)/gi,
        '$1: [redacted]',
      )
      // Bare, quoted-JSON and header-style credential pairs: token=…, "token":"…", X-Api-Key: …
      .replace(
        /\b(key|(?:access|refresh)[_-]?token|apikey|api[_-]?key|token|secret|password|cookie|set-cookie|x-api-key|x-auth-token)(\s*["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
        '$1$2[redacted]',
      )
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
      .replace(/https?:\/\/[^\s]+/gi, (raw) => {
        try {
          const url = new URL(raw);
          return `${url.origin}${url.pathname}`;
        } catch {
          return '[url]';
        }
      }),
    300,
  );
}

export function sanitizeLogDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (details === undefined) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_KEYS.has(key) || UNSAFE_DETAIL_KEY.test(key)) continue;
    if (typeof value === 'string') {
      safe[key] = truncate(sanitizeLogMessage(value), 160);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
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
