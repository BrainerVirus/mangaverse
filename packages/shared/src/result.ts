/**
 * Normalized application errors and Result helpers.
 * Safe for logging or UI: never put secrets in `details` or `message`.
 */

export type AppErrorCode = string;

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  /** Opaque provider identifier for correlation; not a secret. */
  readonly providerId?: string;
  readonly retryable?: boolean;
  /** Structured, non-sensitive diagnostic fields only. */
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export type AppResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError };

export function ok<T>(value: T): AppResult<T> {
  return { ok: true, value };
}

export function err<T = never>(error: AppError): AppResult<T> {
  return { ok: false, error };
}

export interface CreateAppErrorInput {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly providerId?: string;
  readonly retryable?: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export function createAppError(input: CreateAppErrorInput): AppError {
  return {
    code: input.code,
    message: input.message,
    ...(input.cause !== undefined ? { cause: input.cause } : {}),
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
    ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };
}
