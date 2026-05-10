import { err, ok, type AppResult } from '@app/shared';
import { platformInvalidUrl } from './errors.js';

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isExtensionInstallProtocolUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'mangaverse:' &&
      parsed.hostname === 'install-extension' &&
      parsed.searchParams.has('url')
    );
  } catch {
    return false;
  }
}

/**
 * Parse `mangaverse://install-extension?url=<encoded https URL>` and return the provider URL.
 */
export function parseMangaverseInstallExtensionProviderUrl(raw: string): AppResult<string> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return err(platformInvalidUrl('Invalid mangaverse install URL.'));
  }

  if (parsed.protocol !== 'mangaverse:' || parsed.hostname !== 'install-extension') {
    return err(platformInvalidUrl('URL is not a mangaverse install-extension link.'));
  }

  const encoded = parsed.searchParams.get('url');
  if (!encoded) {
    return err(platformInvalidUrl('Missing url query parameter.'));
  }

  let providerUrl: string;
  try {
    providerUrl = decodeURIComponent(encoded);
  } catch {
    return err(platformInvalidUrl('Could not decode provider URL.'));
  }

  if (!isSafeExternalUrl(providerUrl)) {
    return err(platformInvalidUrl('Provider URL must use http or https.'));
  }

  return ok(providerUrl);
}
