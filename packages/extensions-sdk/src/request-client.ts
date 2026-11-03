import type { AppError, AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

import { normalizeProviderError } from './errors.js';
import type { ProviderRequest } from './contract-types.js';
import type { RequestGate } from './request-gate.js';

export interface ProviderRequestClientOptions {
  readonly fetchImpl: typeof fetch;
  readonly defaultTimeoutMs?: number;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  /** Per-provider rate gate; when present every request acquires a slot first. */
  readonly gate?: RequestGate;
}

export interface ProviderRequestResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
}

export interface ProviderRequestClient {
  readonly request: (input: ProviderRequest) => Promise<AppResult<ProviderRequestResponse>>;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Keeps a typed SDK error (from the gate) intact; anything else is normalized. */
function acquireError(error: unknown, url: string): AppError {
  if (error !== null && typeof error === 'object' && 'code' in error && 'message' in error) {
    const code = (error as { readonly code?: unknown }).code;
    const message = (error as { readonly message?: unknown }).message;
    if (typeof code === 'string' && typeof message === 'string') {
      return error as AppError;
    }
  }
  return normalizeProviderError(error, { url });
}

/**
 * A gate refusal crosses the request boundary with the wait that remains, so an
 * abort or block behind a long `Retry-After` reports the real park instead of the
 * gate's internal zero.
 */
function withRemainingWait(error: AppError, gate: RequestGate): AppError {
  if (error.code !== 'extensions.sdk.ratelimit.blocked') return error;
  const remainingMs = gate.remainingWaitMs();
  if (remainingMs <= 0) return error;
  const reported = error.details?.retryAfterMs;
  const retryAfterMs = typeof reported === 'number' ? Math.max(reported, remainingMs) : remainingMs;
  return {
    ...error,
    details: { ...(error.details ?? {}), retryAfterMs },
  };
}

export function createProviderRequestClient(
  options: ProviderRequestClientOptions,
): ProviderRequestClient {
  const { fetchImpl, defaultTimeoutMs = 30_000, defaultHeaders, gate } = options;

  async function request(input: ProviderRequest): Promise<AppResult<ProviderRequestResponse>> {
    const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    const caller = input.signal;
    const abortFromCaller = (): void => {
      controller.abort(caller?.reason);
    };
    if (caller) {
      if (caller.aborted) {
        abortFromCaller();
      } else {
        caller.addEventListener('abort', abortFromCaller, { once: true });
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const clearRequestTimeout = (): void => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const mergedHeaders: Record<string, string> = { ...(defaultHeaders ?? {}) };
    if (input.headers) {
      for (const [k, v] of Object.entries(input.headers)) {
        mergedHeaders[k] = v;
      }
    }

    try {
      if (gate !== undefined) {
        const gateFailure = await gate
          .acquire({
            ...(input.requestsPerMinute !== undefined
              ? { requestsPerMinute: input.requestsPerMinute }
              : {}),
            signal: controller.signal,
          })
          .then(
            () => undefined,
            (e: unknown) => acquireError(e, input.url),
          );
        if (gateFailure !== undefined) {
          return err(withRemainingWait(gateFailure, gate));
        }
      }

      // The response timeout starts only once the gate grants a slot. A request
      // parked behind a long `Retry-After` is waiting for its turn, not stalled
      // on a socket; the caller's own signal still aborts it immediately.
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          controller.abort(new Error('timeout'));
        }, timeoutMs);
      }

      const init: RequestInit = {
        method: input.method ?? 'GET',
        headers: mergedHeaders,
        signal: controller.signal,
      };
      if (input.body !== undefined) {
        init.body = input.body;
      }
      const response = await fetchImpl(input.url, init);

      // Record the response before reading its body: a 429 must park later
      // callers even when this body read is aborted.
      const recordedHeaders = headersToRecord(response.headers);
      const retryAfterMs = gate?.noteResponse(response.status, recordedHeaders);

      const bodyText = await response.text();
      clearRequestTimeout();

      if (!response.ok) {
        return err(
          createAppError({
            code: 'extensions.sdk.request.http_error',
            message: `HTTP ${response.status}.`,
            details: {
              status: response.status,
              ...(response.status === 429 ? { retryAfterMs: retryAfterMs ?? 0 } : {}),
            },
          }),
        );
      }

      return ok({
        status: response.status,
        headers: recordedHeaders,
        bodyText,
      });
    } catch (e) {
      return err(normalizeProviderError(e, { url: input.url }));
    } finally {
      clearRequestTimeout();
      caller?.removeEventListener('abort', abortFromCaller);
    }
  }

  return { request };
}
