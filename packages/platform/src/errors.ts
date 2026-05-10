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
