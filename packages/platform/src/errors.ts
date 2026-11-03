import { createAppError, type AppError } from '@app/shared';

export function platformUnsupported(message: string, cause?: unknown): AppError {
  return createAppError({
    code: 'platform.unsupported',
    message,
    ...(cause !== undefined ? { cause } : {}),
  });
}

export function platformInvalidUrl(message: string): AppError {
  return createAppError({ code: 'platform.invalid-url', message });
}

export function platformPermissionDenied(message: string): AppError {
  return createAppError({ code: 'platform.permission-denied', message });
}

export function platformIoFailed(message: string, cause?: unknown): AppError {
  return createAppError({
    code: 'platform.io-failed',
    message,
    ...(cause !== undefined ? { cause } : {}),
  });
}

/**
 * A write that failed because the device or quota is full. It is a distinct code so the
 * caller can offer storage management instead of retrying into the same wall (#222).
 */
export function platformStorageFull(message: string, cause?: unknown): AppError {
  return createAppError({
    code: 'platform.storage-full',
    message,
    ...(cause !== undefined ? { cause } : {}),
  });
}

const STORAGE_FULL_TEXT = /quota|enospc|no space left|disk is full|disk full|insufficient storage/i;

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** Walks a failure's cause chain for the shapes a full disk or an exhausted quota takes. */
export function isStorageFullFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const name = field(current, 'name');
    const code = field(current, 'code');
    const message = field(current, 'message');
    if (name === 'QuotaExceededError') return true;
    if (typeof code === 'string' && /^(ENOSPC|EDQUOT)$/.test(code)) return true;
    if (typeof message === 'string' && STORAGE_FULL_TEXT.test(message)) return true;
    current = field(current, 'cause');
  }
  return false;
}

export function platformSecureStorageUnavailable(message: string): AppError {
  return createAppError({ code: 'platform.secure-storage-unavailable', message });
}

export function platformCancelled(message: string): AppError {
  return createAppError({ code: 'platform.cancelled', message });
}

export function platformUnexpected(message: string, cause?: unknown): AppError {
  return createAppError({
    code: 'platform.unexpected',
    message,
    ...(cause !== undefined ? { cause } : {}),
  });
}
