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

export function normalizeProviderError(error: unknown, context?: NormalizeProviderErrorContext): AppError {
  const ud = urlDetails(context);

  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const e = error as { code: unknown; message: unknown; providerId?: unknown; retryable?: unknown };
    if (typeof e.code === 'string' && typeof e.message === 'string') {
      if (ud !== undefined) {
        return createAppError({
          code: e.code,
          message: e.message,
          ...(typeof e.providerId === 'string' ? { providerId: e.providerId } : {}),
          ...(typeof e.retryable === 'boolean' ? { retryable: e.retryable } : {}),
          details: ud,
        });
      }
      return createAppError({
        code: e.code,
        message: e.message,
        ...(typeof e.providerId === 'string' ? { providerId: e.providerId } : {}),
        ...(typeof e.retryable === 'boolean' ? { retryable: e.retryable } : {}),
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
