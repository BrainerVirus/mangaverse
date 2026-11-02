import type { AppError, AppResult, ProviderManifest } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import { validateProviderManifest } from '@app/shared';
import { validateRemoteManifestUrlForFetch } from '@app/extensions-sdk';

export interface ExtensionFetchEnvironment {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly maxManifestBytes?: number;
  /** Cancels the request, e.g. when the user dismisses an import dialog. */
  readonly signal?: AbortSignal;
  /** Overall request timeout; defaults to 15 seconds. */
  readonly timeoutMs?: number;
}

const DEFAULT_MAX_MANIFEST_BYTES = 256_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

function abortReason(
  label: string,
  externalSignal: AbortSignal | undefined,
  controller: AbortController,
  timeoutMs: number,
): AppError | undefined {
  if (externalSignal?.aborted === true) {
    return createAppError({
      code: 'extensions.core.fetch.aborted',
      message: `${label} fetch was cancelled.`,
    });
  }
  if (controller.signal.aborted) {
    return createAppError({
      code: 'extensions.core.fetch.timeout',
      message: `${label} fetch timed out after ${timeoutMs} ms.`,
    });
  }
  return undefined;
}

export async function fetchManifestFromUrl(
  url: string,
  environment: ExtensionFetchEnvironment,
  label = 'manifest',
): Promise<AppResult<{ json: unknown; rawText: string }>> {
  const urlResult = validateRemoteManifestUrlForFetch(url);
  if (!urlResult.ok) return urlResult;

  const controller = new AbortController();
  const timeoutMs = environment.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = environment.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal?.aborted === true) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    if (externalSignal?.aborted === true) {
      const reason = abortReason(label, externalSignal, controller, timeoutMs);
      if (reason !== undefined) return err(reason);
    }

    let response: Response;
    try {
      response = await environment.fetch(urlResult.value, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (e) {
      const reason = abortReason(label, externalSignal, controller, timeoutMs);
      if (reason !== undefined) return err(reason);
      return err(
        createAppError({
          code: 'extensions.core.fetch.failed',
          message: `Could not fetch ${label}.`,
          cause: e,
        }),
      );
    }

    if (!response.ok) {
      return err(
        createAppError({
          code: 'extensions.core.fetch.http_error',
          message: `${label} fetch failed with HTTP ${response.status}.`,
          details: { status: response.status },
        }),
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
      return err(
        createAppError({
          code: 'extensions.core.fetch.code_response',
          message: `Refusing ${label} response that looks like executable script.`,
        }),
      );
    }

    let rawText: string;
    try {
      rawText = await response.text();
    } catch (e) {
      const reason = abortReason(label, externalSignal, controller, timeoutMs);
      if (reason !== undefined) return err(reason);
      return err(
        createAppError({
          code: 'extensions.core.fetch.failed',
          message: `Could not read ${label} response.`,
          cause: e,
        }),
      );
    }

    const maxBytes = environment.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES;
    const sizeBytes = new TextEncoder().encode(rawText).byteLength;
    if (sizeBytes > maxBytes) {
      return err(
        createAppError({
          code: 'extensions.core.fetch.body_too_large',
          message: `${label} body exceeds ${maxBytes} bytes.`,
          details: { size: sizeBytes, limit: maxBytes },
        }),
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      return err(
        createAppError({
          code: 'extensions.core.fetch.invalid_json',
          message: `${label} response was not valid JSON.`,
          cause: e,
        }),
      );
    }

    return ok({ json, rawText });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}

export async function fetchAndValidateManifestFromUrl(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<ProviderManifest>> {
  const raw = await fetchManifestFromUrl(url, environment);
  if (!raw.ok) return raw;
  return validateProviderManifest(raw.value.json);
}
