import type { AppResult, ProviderContentFlags } from '@app/shared';
import { createAppError, err, ok } from '@app/shared';
import { validateRemoteManifestUrlForFetch } from '@app/extensions-sdk';
import type { PlatformAdapter } from '@app/platform';
import { isExtensionInstallProtocolUrl, isSafeExternalUrl, parseMangaverseInstallExtensionProviderUrl } from '@app/platform';

import { buildInstallPreview, createExtensionInstallSession, transitionExtensionInstall } from './install-session.js';
import type { ExtensionInstallSession, ExtensionInstallSource } from './install-types.js';
import { fetchAndValidateManifestFromUrl } from './manifest-fetch.js';
import type { ExtensionFetchEnvironment } from './manifest-fetch.js';
import type { ExtensionInstallPolicy } from './install-policy.js';
import { validateManifestInstallPolicy } from './install-policy.js';

export interface RegistryProviderEntry {
  readonly name: string;
  readonly manifestUrl: string;
  readonly description?: string;
  readonly publisher?: string;
  readonly languages?: readonly string[];
  readonly contentFlags?: ProviderContentFlags;
}

export async function prepareManualExtensionInstall(
  url: string,
  environment: ExtensionFetchEnvironment,
  policy?: ExtensionInstallPolicy,
): Promise<AppResult<ExtensionInstallSession>> {
  const urlCheck = validateRemoteManifestUrlForFetch(url);
  if (!urlCheck.ok) return urlCheck;

  let session = createExtensionInstallSession();
  session = transitionExtensionInstall(session, { type: 'startFromManualUrl', url: urlCheck.value });

  const manifestResult = await fetchAndValidateManifestFromUrl(urlCheck.value, environment);
  if (!manifestResult.ok) {
    return ok(transitionExtensionInstall(session, { type: 'manifestRejected', error: manifestResult.error }));
  }

  if (policy) {
    const policyResult = validateManifestInstallPolicy(manifestResult.value, policy);
    if (!policyResult.ok) {
      return ok(transitionExtensionInstall(session, { type: 'manifestRejected', error: policyResult.error }));
    }
  }

  const source: ExtensionInstallSource = { kind: 'manual', manifestUrl: urlCheck.value };
  const preview = buildInstallPreview(manifestResult.value, source);
  session = transitionExtensionInstall(session, {
    type: 'manifestFetched',
    manifest: manifestResult.value,
    preview,
    source,
  });
  return ok(session);
}

export async function prepareRegistryExtensionInstall(
  registryUrl: string,
  entry: RegistryProviderEntry,
  environment: ExtensionFetchEnvironment,
  policy?: ExtensionInstallPolicy,
): Promise<AppResult<ExtensionInstallSession>> {
  const registryUrlResult = validateRemoteManifestUrlForFetch(registryUrl);
  if (!registryUrlResult.ok) {
    return registryUrlResult;
  }
  const normalizedRegistryUrl = registryUrlResult.value;

  if (!entry.manifestUrl || entry.manifestUrl.trim() === '') {
    return err(
      createAppError({
        code: 'extensions.core.registry.missing_manifest_url',
        message: 'Registry entry requires a manifest URL.',
      }),
    );
  }

  const manifestUrlResult = validateRemoteManifestUrlForFetch(entry.manifestUrl);
  if (!manifestUrlResult.ok) {
    return manifestUrlResult;
  }
  const normalizedManifestUrl = manifestUrlResult.value;

  let session = createExtensionInstallSession();
  session = transitionExtensionInstall(session, {
    type: 'startFromRegistryEntry',
    registryUrl: normalizedRegistryUrl,
    entryName: entry.name,
    manifestUrl: normalizedManifestUrl,
  });

  const manifestResult = await fetchAndValidateManifestFromUrl(normalizedManifestUrl, environment);
  if (!manifestResult.ok) {
    return ok(transitionExtensionInstall(session, { type: 'manifestRejected', error: manifestResult.error }));
  }

  if (policy) {
    const policyResult = validateManifestInstallPolicy(manifestResult.value, policy);
    if (!policyResult.ok) {
      return ok(transitionExtensionInstall(session, { type: 'manifestRejected', error: policyResult.error }));
    }
  }

  const source: ExtensionInstallSource = {
    kind: 'registry',
    registryUrl: normalizedRegistryUrl,
    entryName: entry.name,
    manifestUrl: normalizedManifestUrl,
  };
  const preview = buildInstallPreview(manifestResult.value, source);
  session = transitionExtensionInstall(session, {
    type: 'manifestFetched',
    manifest: manifestResult.value,
    preview,
    source,
  });
  return ok(session);
}

export async function prepareProtocolExtensionInstall(
  platformAdapter: PlatformAdapter,
  environment: ExtensionFetchEnvironment,
  policy?: ExtensionInstallPolicy,
): Promise<AppResult<ExtensionInstallSession>> {
  const pending = await platformAdapter.protocol.getPendingInstallUrl();
  if (!pending.ok) {
    return err(pending.error);
  }

  const raw = pending.value;
  if (raw === null || raw === '') {
    return ok(createExtensionInstallSession());
  }

  let resolved: string;
  if (isExtensionInstallProtocolUrl(raw)) {
    const parsed = parseMangaverseInstallExtensionProviderUrl(raw);
    if (!parsed.ok) {
      return ok(
        transitionExtensionInstall(createExtensionInstallSession(), {
          type: 'manifestRejected',
          error: parsed.error,
        }),
      );
    }
    resolved = parsed.value;
  } else if (isSafeExternalUrl(raw)) {
    resolved = raw;
  } else {
    return ok(
      transitionExtensionInstall(createExtensionInstallSession(), {
        type: 'manifestRejected',
        error: createAppError({
          code: 'extensions.core.protocol.bad_url',
          message: 'Pending install URL is not a supported https manifest URL.',
        }),
      }),
    );
  }

  const urlCheck = validateRemoteManifestUrlForFetch(resolved);
  if (!urlCheck.ok) {
    return ok(
      transitionExtensionInstall(createExtensionInstallSession(), {
        type: 'manifestRejected',
        error: urlCheck.error,
      }),
    );
  }

  let session = createExtensionInstallSession();
  session = transitionExtensionInstall(session, {
    type: 'startFromProtocolHandoff',
    rawUrl: raw,
    resolvedManifestUrl: urlCheck.value,
  });

  const manifestResult = await fetchAndValidateManifestFromUrl(urlCheck.value, environment);
  if (!manifestResult.ok) {
    return ok(transitionExtensionInstall(session, { type: 'manifestRejected', error: manifestResult.error }));
  }

  if (policy) {
    const policyResult = validateManifestInstallPolicy(manifestResult.value, policy);
    if (!policyResult.ok) {
      return ok(transitionExtensionInstall(session, { type: 'manifestRejected', error: policyResult.error }));
    }
  }

  const source: ExtensionInstallSource = {
    kind: 'protocol',
    manifestUrl: urlCheck.value,
    rawHandoffUrl: raw,
  };
  const preview = buildInstallPreview(manifestResult.value, source);
  session = transitionExtensionInstall(session, {
    type: 'manifestFetched',
    manifest: manifestResult.value,
    preview,
    source,
  });
  return ok(session);
}
