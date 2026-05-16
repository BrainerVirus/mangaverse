import type { AppResult, ProviderManifest } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import { validateProviderManifest } from '@app/shared';
import { validateRemoteManifestUrlForFetch } from '@app/extensions-sdk';

export interface ExtensionFetchEnvironment {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly maxManifestBytes?: number;
}

const DEFAULT_MAX_MANIFEST_BYTES = 256_000;

export async function fetchManifestFromUrl(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<{ json: unknown; rawText: string }>> {
  const urlResult = validateRemoteManifestUrlForFetch(url);
  if (!urlResult.ok) return urlResult;

  let response: Response;
  try {
    response = await environment.fetch(urlResult.value, {
      headers: { accept: 'application/json' },
    });
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.core.fetch.failed',
        message: 'Could not fetch manifest.',
        cause: e,
      }),
    );
  }

  if (!response.ok) {
    return err(
      createAppError({
        code: 'extensions.core.fetch.http_error',
        message: `Manifest fetch failed with HTTP ${response.status}.`,
        details: { status: response.status },
      }),
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
    return err(
      createAppError({
        code: 'extensions.core.fetch.code_response',
        message: 'Refusing manifest response that looks like executable script.',
      }),
    );
  }

  let rawText: string;
  try {
    rawText = await response.text();
  } catch (e) {
    return err(
      createAppError({
        code: 'extensions.core.fetch.failed',
        message: 'Could not read manifest response.',
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
        message: `Manifest body exceeds ${maxBytes} bytes.`,
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
        message: 'Manifest response was not valid JSON.',
        cause: e,
      }),
    );
  }

  return ok({ json, rawText });
}

export async function fetchAndValidateManifestFromUrl(
  url: string,
  environment: ExtensionFetchEnvironment,
): Promise<AppResult<ProviderManifest>> {
  const raw = await fetchManifestFromUrl(url, environment);
  if (!raw.ok) return raw;
  return validateProviderManifest(raw.value.json);
}
