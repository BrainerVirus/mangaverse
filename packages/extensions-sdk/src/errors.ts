import type { AppError } from '@app/shared';
import { createAppError } from '@app/shared';

export interface NormalizeProviderErrorContext {
  readonly providerId?: string;
  readonly url?: string;
  readonly operation?: string;
}

/**
 * Strips query and fragment so error `details` never carry tokens from URLs.
 */
export function redactUrlForErrorDetails(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
}

function urlDetails(
  context?: NormalizeProviderErrorContext,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (context?.url === undefined) return undefined;
  const redacted = redactUrlForErrorDetails(context.url);
  if (redacted === '') return undefined;
  return { url: redacted };
}

/**
 * The only failure details that may cross a normalization boundary. They are
 * diagnostic (a Node errno, the checked address, a rate-limit horizon), never
 * credentials or caller-provided extras such as headers.
 */
const DIAGNOSTIC_DETAIL_KEYS = new Set(['errno', 'address', 'retryAfterMs', 'status']);

/** Keeps only allowlisted, primitive diagnostic fields a typed failure already carried. */
function safeDetails(
  value: unknown,
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!DIAGNOSTIC_DETAIL_KEYS.has(key)) continue;
    if (
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean' ||
      entry === null
    ) {
      out[key] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeDetails(
  ...parts: readonly (Readonly<Record<string, string | number | boolean | null>> | undefined)[]
): Readonly<Record<string, string | number | boolean | null>> | undefined {
  const merged = Object.assign({}, ...parts.filter((part) => part !== undefined));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function normalizeProviderError(
  error: unknown,
  context?: NormalizeProviderErrorContext,
): AppError {
  const ud = urlDetails(context);

  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const e = error as {
      code: unknown;
      message: unknown;
      providerId?: unknown;
      retryable?: unknown;
      details?: unknown;
    };
    if (typeof e.code === 'string' && typeof e.message === 'string') {
      const details = mergeDetails(safeDetails(e.details), ud);
      return createAppError({
        code: e.code,
        message: e.message,
        ...(typeof e.providerId === 'string' ? { providerId: e.providerId } : {}),
        ...(typeof e.retryable === 'boolean' ? { retryable: e.retryable } : {}),
        ...(details !== undefined ? { details } : {}),
      });
    }
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return createAppError({
      code: 'extensions.sdk.request.aborted',
      message: 'Request was aborted.',
      ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
    });
  }

  if (error instanceof Error) {
    if (error.message === 'timeout' || error.name === 'TimeoutError') {
      if (ud !== undefined) {
        return createAppError({
          code: 'extensions.sdk.request.timeout',
          message: 'Request timed out.',
          ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
          details: ud,
        });
      }
      return createAppError({
        code: 'extensions.sdk.request.timeout',
        message: 'Request timed out.',
        ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
      });
    }
    if (ud !== undefined) {
      return createAppError({
        code: 'extensions.sdk.unknown',
        message: 'An unexpected error occurred.',
        cause: error,
        ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
        details: ud,
      });
    }
    return createAppError({
      code: 'extensions.sdk.unknown',
      message: 'An unexpected error occurred.',
      cause: error,
      ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
    });
  }

  if (ud !== undefined) {
    return createAppError({
      code: 'extensions.sdk.unknown',
      message: 'An unexpected error occurred.',
      ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
      details: ud,
    });
  }
  return createAppError({
    code: 'extensions.sdk.unknown',
    message: 'An unexpected error occurred.',
    ...(context?.providerId !== undefined ? { providerId: context.providerId } : {}),
  });
}
