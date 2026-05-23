import type { ExtensionInstallWarning, ProviderManifest } from '@app/shared';

import type {
  ExtensionInstallAction,
  ExtensionInstallPreview,
  ExtensionInstallSession,
  ExtensionInstallSource,
} from './install-types.js';

export function createExtensionInstallSession(): ExtensionInstallSession {
  return { step: 'idle', warnings: [] };
}

function mergeWarnings(
  a: readonly ExtensionInstallWarning[],
  b: readonly ExtensionInstallWarning[],
): readonly ExtensionInstallWarning[] {
  return [...a, ...b];
}

export function transitionExtensionInstall(
  session: ExtensionInstallSession,
  action: ExtensionInstallAction,
): ExtensionInstallSession {
  switch (action.type) {
    case 'startFromManualUrl':
      return {
        step: 'fetchingManifest',
        manifestFetchUrl: action.url,
        source: { kind: 'manual', manifestUrl: action.url },
        warnings: session.warnings,
      };
    case 'startFromRegistryEntry':
      return {
        step: 'fetchingManifest',
        manifestFetchUrl: action.manifestUrl,
        source: {
          kind: 'registry',
          registryUrl: action.registryUrl,
          entryName: action.entryName,
          manifestUrl: action.manifestUrl,
        },
        warnings: session.warnings,
      };
    case 'startFromProtocolHandoff':
      return {
        step: 'fetchingManifest',
        manifestFetchUrl: action.resolvedManifestUrl,
        source: {
          kind: 'protocol',
          manifestUrl: action.resolvedManifestUrl,
          rawHandoffUrl: action.rawUrl,
        },
        warnings: session.warnings,
      };
    case 'manifestFetched': {
      const { lastError, manifestFetchUrl, ...rest } = session;
      void lastError;
      void manifestFetchUrl;
      return {
        ...rest,
        step: 'awaitingConfirmation',
        manifest: action.manifest,
        preview: action.preview,
        source: action.source,
        warnings: mergeWarnings(session.warnings, action.preview.warnings),
      };
    }
    case 'manifestRejected':
      return {
        step: 'manifestInvalid',
        warnings: session.warnings,
        lastError: action.error,
        ...(session.source !== undefined ? { source: session.source } : {}),
        ...(session.manifestFetchUrl !== undefined ? { manifestFetchUrl: session.manifestFetchUrl } : {}),
      };
    case 'confirm':
      if (session.step !== 'awaitingConfirmation' || session.manifest === undefined) {
        return session;
      }
      {
        const { lastError, ...rest } = session;
        void lastError;
        return { ...rest, step: 'installing' };
      }
    case 'cancel':
      if (session.step === 'installed' || session.step === 'cancelled') {
        return session;
      }
      {
        const { lastError, ...rest } = session;
        void lastError;
        return { ...rest, step: 'cancelled' };
      }
    case 'installSucceeded':
      if (session.step !== 'installing') return session;
      return { ...session, step: 'installed' };
    case 'installFailed':
      if (session.step !== 'installing') return session;
      return { ...session, step: 'failed', lastError: action.error };
    default:
      return session;
  }
}

export function buildInstallPreview(
  manifest: ProviderManifest,
  source: ExtensionInstallSource,
): ExtensionInstallPreview {
  const warnings: ExtensionInstallWarning[] = [];

  const limitations: string[] = [];
  for (const d of manifest.capabilityDetails ?? []) {
    if (!d.supported) limitations.push(`${d.key}: not supported`);
    if (d.knownRestrictions?.length) {
      for (const r of d.knownRestrictions) {
        limitations.push(`${d.key}: ${r}`);
      }
    }
  }

  const manifestUrl =
    source.kind === 'manual'
      ? source.manifestUrl
      : source.kind === 'registry'
        ? source.manifestUrl
        : source.manifestUrl;

  return {
    providerName: manifest.name,
    providerId: manifest.id,
    version: manifest.version,
    ...(manifest.source.publisher !== undefined ? { publisher: manifest.source.publisher } : {}),
    sourceUrl: manifest.source.url,
    ...(manifest.source.manifestUrl !== undefined ? { manifestUrl: manifest.source.manifestUrl } : { manifestUrl }),
    platforms: manifest.compatibility.platforms,
    capabilities: manifest.capabilities,
    ...(manifest.capabilityDetails !== undefined ? { capabilityDetails: manifest.capabilityDetails } : {}),
    capabilityLimitations: limitations,
    permissions: manifest.permissions,
    languages: manifest.languages,
    contentFlags: manifest.contentFlags,
    checksumStatus: manifest.checksum !== undefined && manifest.checksum.trim() !== '' ? 'present_unverified' : 'absent',
    signatureStatus:
      manifest.signature !== undefined && manifest.signature.trim() !== '' ? 'present_unverified' : 'absent',
    warnings,
  };
}
