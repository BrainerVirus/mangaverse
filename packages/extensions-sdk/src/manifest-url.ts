import type { AppResult } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';

const CODE_URL_PATH = /\.(mjs|cjs|js|wasm)(\?|#|$)/i;

/**
 * Validates that a URL is safe to fetch as a JSON manifest (http/https only, not a direct code asset URL).
 */
export function validateRemoteManifestUrlForFetch(raw: string): AppResult<string> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return err(
      createAppError({
        code: 'extensions.sdk.manifest.bad_url',
        message: 'Manifest URL is not a valid URL.',
      }),
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return err(
      createAppError({
        code: 'extensions.sdk.manifest.unsafe_scheme',
        message: 'Manifest URL must use http or https.',
      }),
    );
  }

  if (CODE_URL_PATH.test(parsed.pathname)) {
    return err(
      createAppError({
        code: 'extensions.sdk.manifest.code_url',
        message: 'Executable code URLs cannot be used as manifest installs in this phase.',
      }),
    );
  }

  return ok(parsed.toString());
}
