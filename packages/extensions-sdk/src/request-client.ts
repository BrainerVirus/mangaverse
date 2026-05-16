import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

import { normalizeProviderError } from './errors.js';
import type { ProviderRequest } from './contract-types.js';

export interface ProviderRequestClientOptions {
  readonly fetchImpl: typeof fetch;
  readonly defaultTimeoutMs?: number;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
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

export function createProviderRequestClient(options: ProviderRequestClientOptions): ProviderRequestClient {
  const { fetchImpl, defaultTimeoutMs = 30_000, defaultHeaders } = options;

  async function request(input: ProviderRequest): Promise<AppResult<ProviderRequestResponse>> {
    const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    if (input.signal) {
      if (input.signal.aborted) {
        controller.abort(input.signal.reason);
      } else {
        input.signal.addEventListener(
          'abort',
          () => {
            controller.abort(input.signal?.reason);
          },
          { once: true },
        );
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        controller.abort(new Error('timeout'));
      }, timeoutMs);
    }

    const mergedHeaders: Record<string, string> = { ...(defaultHeaders ?? {}) };
    if (input.headers) {
      for (const [k, v] of Object.entries(input.headers)) {
        mergedHeaders[k] = v;
      }
    }

    try {
      const init: RequestInit = {
        method: input.method ?? 'GET',
        headers: mergedHeaders,
        signal: controller.signal,
      };
      if (input.body !== undefined) {
        init.body = input.body;
      }
      const response = await fetchImpl(input.url, init);

      const bodyText = await response.text();
      if (timeoutId !== undefined) clearTimeout(timeoutId);

      if (!response.ok) {
        return err(
          createAppError({
            code: 'extensions.sdk.request.http_error',
            message: `HTTP ${response.status}.`,
            details: { status: response.status },
          }),
        );
      }

      return ok({
        status: response.status,
        headers: headersToRecord(response.headers),
        bodyText,
      });
    } catch (e) {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      return err(normalizeProviderError(e, { url: input.url }));
    }
  }

  return { request };
}
